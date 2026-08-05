import { NextResponse } from "next/server";
import { currentUserId, withUser } from "@/lib/db/client";
import { runTool } from "@/lib/actions";
import { gate, asPermission } from "@/lib/tools/permission";
import { toolCatalog } from "@/lib/tools/registry";
import { toolErrorResponse } from "@/lib/tools/http";
import type { ConnectorHealth } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/tools — wat kan Wingman nú, voor déze gebruiker.
 *
 * Niet alleen de catalogus: per tool staat erbij wat er gebeurt als je hem
 * aanroept. Dat is het verschil tussen een lijst en een bruikbaar antwoord —
 * een aanroeper (straks: het model) hoeft niet te gokken of iets stilletjes
 * doorgaat of een vraag oplevert.
 */
export async function GET() {
  const userId = await currentUserId();
  const connectors = await withUser(userId, (tx) =>
    tx.connector.findMany({ where: { user_id: userId } }),
  );

  const tools = toolCatalog().map(({ tool, provider }) => {
    const connector = connectors.find((c) => c.provider === provider);
    if (!connector) {
      return {
        name: tool.name,
        label: tool.label,
        effect: tool.effect,
        available: false,
        reason: "bron niet gekoppeld",
      };
    }
    const verdict = gate({
      connectorLabel: connector.label,
      connectorStatus: connector.status as ConnectorHealth["status"],
      permission: asPermission(connector.permission),
      effect: tool.effect,
    });
    return {
      name: tool.name,
      label: tool.label,
      effect: tool.effect,
      connector: connector.label,
      permission: connector.permission,
      available: verdict.allow,
      requires_approval: verdict.allow ? verdict.requiresApproval : undefined,
      reason: verdict.allow ? undefined : verdict.error.message,
    };
  });

  return NextResponse.json({ tools });
}

/**
 * POST /api/v1/tools — { tool, params }.
 *
 * 202 betekent: vastgelegd, wacht op een ja van de gebruiker. Dat is geen fout
 * en mag niet als fout binnenkomen bij de aanroeper.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    tool?: string;
    params?: unknown;
  } | null;

  if (!body?.tool) {
    return NextResponse.json({ error: "Veld 'tool' ontbreekt." }, { status: 400 });
  }

  try {
    const outcome = await runTool(body.tool, body.params ?? {});
    return NextResponse.json(outcome, { status: outcome.status === "pending" ? 202 : 200 });
  } catch (e) {
    return toolErrorResponse(e);
  }
}
