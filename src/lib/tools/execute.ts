import type { Connector, ToolCall } from "@prisma/client";
import { withUser, type Tx } from "@/lib/db/with-user";
import { clamp } from "@/lib/text";
import type { AdapterContext, ConnectorHealth } from "@/lib/types";
import { asPermission, gate } from "./permission";
import { findTool } from "./registry";
import { toolErrors, ToolError, type ResolvedTool } from "./types";

/**
 * De uitvoerder: van "doe dit" naar een rij in ToolCall en, als het mag, een
 * aanroep bij de bron.
 *
 * Drie dingen die de volgorde bepalen:
 *
 * 1. **De rij wordt geschreven vóór de aanroep.** Een call die halverwege
 *    crasht laat dan geen gat in het logboek achter — je ziet een `pending` of
 *    `failed` staan in plaats van niets. Achteraf loggen betekent dat precies
 *    de mislukkingen die je wilt zien, ontbreken.
 *
 * 2. **De netwerkaanroep staat buiten de transactie.** withUser() draait op de
 *    transaction pooler; een HTTP-call binnen die transactie houdt een
 *    databaseverbinding bezet zolang Google er over doet. Twee korte
 *    transacties met een trage aanroep ertussen, niet één lange.
 *
 * 3. **Tokens gaan hier niet uit.** Wat deze module teruggeeft is wat de UI en
 *    de REST-laag mogen zien; de connectorrij zelf blijft binnen.
 */

const TIMEOUT_MS = 15_000;
const MAX_RESULT_CHARS = 2_000;

export interface ToolCallView {
  id: string;
  tool: string;
  effect: string;
  summary: string;
  status: string;
  created_at: Date;
  finished_at: Date | null;
  error_code: string | null;
  error_message: string | null;
}

const view = (c: {
  id: string;
  tool: string;
  effect: string;
  summary: string;
  status: string;
  created_at: Date;
  finished_at: Date | null;
  error_code: string | null;
  error_message: string | null;
}): ToolCallView => ({
  id: c.id,
  tool: c.tool,
  effect: c.effect,
  summary: c.summary,
  status: c.status,
  created_at: c.created_at,
  finished_at: c.finished_at,
  error_code: c.error_code,
  error_message: c.error_message,
});

export interface ToolRequest {
  /** Vastgelegd, en uitgevoerd of niet. */
  call: ToolCallView;
  /** `pending` betekent: er ligt een vraag klaar voor de gebruiker. */
  status: "done" | "pending" | "failed";
  result?: unknown;
}

/**
 * Vraag een tool aan. Geeft `pending` terug als de permissiegradiënt een "ja"
 * van de gebruiker verlangt — dan gebeurt er nog niets bij de bron.
 */
export async function requestTool(
  userId: string,
  toolName: string,
  rawParams: unknown,
): Promise<ToolRequest> {
  const resolved = findTool(toolName);
  const params = parseParams(resolved, rawParams);

  const prepared = await withUser(userId, async (tx) => {
    const connector = await pickConnector(tx, userId, resolved);
    const verdict = gate({
      connectorLabel: connector.label,
      connectorStatus: connector.status as ConnectorHealth["status"],
      permission: asPermission(connector.permission),
      effect: resolved.tool.effect,
    });
    if (!verdict.allow) throw verdict.error;

    const call = await tx.toolCall.create({
      data: {
        user_id: userId,
        connector_id: connector.id,
        tool: resolved.tool.name,
        effect: resolved.tool.effect,
        params: JSON.stringify(params),
        summary: clamp(resolved.tool.describe(params), "toolCallSummary"),
        notify: verdict.notify,
        status: verdict.requiresApproval ? "pending" : "running",
        decided_at: verdict.requiresApproval ? null : new Date(),
      },
    });
    return { call, connector, requiresApproval: verdict.requiresApproval };
  });

  if (prepared.requiresApproval) {
    return { call: view(prepared.call), status: "pending" };
  }
  return perform(userId, prepared.call.id, resolved, prepared.connector, params);
}

type Prepared =
  | { kind: "rejected"; call: ToolCall }
  | { kind: "run"; call: ToolCall; connector: Connector };

/**
 * De gebruiker antwoordt op een openstaande vraag. Bij "ja" wordt de tool
 * alsnog uitgevoerd — met de parameters zoals ze bij het voorstel stonden, niet
 * met wat er intussen meegestuurd wordt. Anders keur je het ene goed en voer je
 * het andere uit.
 */
export async function decideToolCall(
  userId: string,
  callId: string,
  decision: "approve" | "reject",
): Promise<ToolRequest> {
  const prepared = await withUser(userId, async (tx): Promise<Prepared> => {
    const call = await tx.toolCall.findFirst({
      where: { id: callId, user_id: userId, status: "pending" },
    });
    if (!call) throw toolErrors.notFound(callId);

    if (decision === "reject") {
      const rejected = await tx.toolCall.update({
        where: { id: call.id },
        data: { status: "rejected", decided_at: new Date(), finished_at: new Date() },
      });
      return { kind: "rejected", call: rejected };
    }

    const connector = await tx.connector.findFirst({
      where: { id: call.connector_id, user_id: userId },
    });
    if (!connector) throw toolErrors.offline("De bron");

    const running = await tx.toolCall.update({
      where: { id: call.id },
      data: { status: "running", decided_at: new Date() },
    });
    return { kind: "run", call: running, connector };
  });

  if (prepared.kind === "rejected") {
    return { call: view(prepared.call), status: "done" };
  }

  const resolved = findTool(prepared.call.tool);
  const params = parseParams(resolved, JSON.parse(prepared.call.params));
  return perform(userId, prepared.call.id, resolved, prepared.connector, params);
}

/* ---------- Lezen -------------------------------------------------------- */

/** Wat ligt er te wachten op een ja of nee. */
export async function pendingToolCalls(userId: string): Promise<ToolCallView[]> {
  const rows = await withUser(userId, (tx) =>
    tx.toolCall.findMany({
      where: { user_id: userId, status: "pending" },
      orderBy: { created_at: "asc" },
    }),
  );
  return rows.map(view);
}

/** Het logboek: wat heeft Wingman gedaan, hoe lang duurde het, wat faalde. */
export async function recentToolCalls(userId: string, take = 20): Promise<ToolCallView[]> {
  const rows = await withUser(userId, (tx) =>
    tx.toolCall.findMany({
      where: { user_id: userId, status: { not: "pending" } },
      orderBy: { created_at: "desc" },
      take,
    }),
  );
  return rows.map(view);
}

/* ---------- Binnenwerk --------------------------------------------------- */

function parseParams(resolved: ResolvedTool, raw: unknown): unknown {
  const parsed = resolved.tool.params.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
      .join("; ");
    throw toolErrors.invalidParams(detail);
  }
  return parsed.data;
}

async function pickConnector(tx: Tx, userId: string, resolved: ResolvedTool): Promise<Connector> {
  // Meerdere accounts van dezelfde bron mag (unique is user+provider+account).
  // Een actieve gaat voor: anders kiest een tweede, kapotte agenda-koppeling
  // willekeurig de aanroep weg.
  const rows = await tx.connector.findMany({
    where: { user_id: userId, provider: resolved.provider },
    orderBy: { account_id: "asc" },
  });
  const connector = rows.find((c) => c.status === "active") ?? rows[0];
  if (!connector) throw toolErrors.offline(labelFor(resolved));
  return connector;
}

function labelFor(resolved: ResolvedTool): string {
  return resolved.provider.charAt(0).toUpperCase() + resolved.provider.slice(1);
}

/** Voert uit, klokt, en schrijft de afloop weg. Gooit nooit stilletjes weg. */
async function perform(
  userId: string,
  callId: string,
  resolved: ResolvedTool,
  connector: Connector,
  params: unknown,
): Promise<ToolRequest> {
  const ctx: AdapterContext = {
    userId,
    connectorId: connector.id,
    accountId: connector.account_id,
    accessToken: connector.access_token ?? undefined,
    refreshToken: connector.refresh_token ?? undefined,
  };

  const started = Date.now();
  try {
    const result = await withTimeout(
      resolved.tool.run(ctx, params),
      connector.label,
    );
    const call = await withUser(userId, (tx) =>
      tx.toolCall.update({
        where: { id: callId },
        data: {
          status: "done",
          result: truncate(JSON.stringify(result ?? null)),
          duration_ms: Date.now() - started,
          finished_at: new Date(),
        },
      }),
    );
    return { call: view(call), status: "done", result };
  } catch (raw) {
    const error = asToolError(raw, connector.label);
    const call = await withUser(userId, async (tx) => {
      // Een 401 is geen incident maar een staat: de koppeling is verlopen. Zet
      // 'm zo, dan ziet de volgende briefing zichzelf als incompleet (rule 2)
      // in plaats van het stil nog eens te proberen.
      if (error.code === "Authentication") {
        await tx.connector.updateMany({
          where: { id: connector.id, user_id: userId },
          data: { status: "reauth_required", error_message: error.message },
        });
      }
      return tx.toolCall.update({
        where: { id: callId },
        data: {
          status: "failed",
          error_code: error.code,
          error_message: error.message,
          duration_ms: Date.now() - started,
          finished_at: new Date(),
        },
      });
    });
    return { call: view(call), status: "failed" };
  }
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(toolErrors.timeout(label, TIMEOUT_MS)), TIMEOUT_MS),
    ),
  ]);
}

/**
 * Alles wat een adapter kan gooien wordt hier één van de bekende codes. Een
 * adapter die `new Error("Gmail HTTP 401")` gooit — zoals de bestaande doen —
 * hoeft daar niet voor herschreven te worden.
 */
export function asToolError(raw: unknown, label: string): ToolError {
  if (raw instanceof ToolError) return raw;
  const message = raw instanceof Error ? raw.message : String(raw);
  if (/\b401\b|invalid_grant|unauthorized/i.test(message)) return toolErrors.auth(label);
  if (/\b429\b|rate.?limit/i.test(message)) return toolErrors.rateLimit(label);
  if (/\b403\b|forbidden|insufficient/i.test(message))
    return new ToolError(
      "Permission",
      `${label} weigert dit (te weinig rechten bij de bron).`,
      "Controleer de scopes bij het opnieuw verbinden.",
    );
  return toolErrors.failed(label, message);
}

function truncate(json: string): string {
  return json.length <= MAX_RESULT_CHARS ? json : `${json.slice(0, MAX_RESULT_CHARS)}…`;
}
