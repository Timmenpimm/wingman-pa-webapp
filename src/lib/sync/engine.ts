import { decryptOptional } from "@/lib/crypto/secrets";
import { clamp } from "@/lib/text";
import type {
  AdapterContext,
  ConnectorAdapter,
  NormalizedEmail,
  NormalizedEvent,
} from "@/lib/types";

/**
 * Sync-engine: haalt per connector de delta op en levert genormaliseerde
 * upserts (Fase 0 van het adviesrapport).
 *
 * Bewust in twee lagen, net als src/lib/tools/execute.ts:
 *
 *  - Het netwerkwerk (token verversen, fetchDelta bij de bron) staat los van
 *    elke databasetransactie. Een trage Google-aanroep mag geen verbinding op
 *    de transaction pooler bezet houden.
 *  - Het wegschrijven (upserts + de statusvelden op Connector) gaat via een
 *    kort `withTx`-blok dat de aanroeper meegeeft — hier dus niet rechtstreeks
 *    `withUser` uit src/lib/db/with-user, zodat dit bestand met een neppe tx
 *    te testen is zonder database.
 *
 * Wie dit aanroept (src/lib/runs/execute.ts) bepaalt welke connectors aan de
 * beurt zijn en injecteert `withTx`; deze module weet niets van Prisma-
 * transacties, alleen van de vorm die het nodig heeft (`SyncTx`).
 */

/** Providers met een werkende sync-adapter. Ponto/CalDAV/IMAP hebben nog geen
 * implementatie (zie src/connectors/generic.ts en ponto-banking.ts — die
 * laatste heeft wel een fetchDelta, maar geen productie-OAuth in deze fase)
 * en worden stil overgeslagen: geen foutmelding voor iets dat nooit
 * geprobeerd is. */
export const SYNCABLE_PROVIDERS = ["google", "gmail"] as const;
export type SyncableProvider = (typeof SYNCABLE_PROVIDERS)[number];

export function isSyncable(provider: string): provider is SyncableProvider {
  return (SYNCABLE_PROVIDERS as readonly string[]).includes(provider);
}

/** Wat de engine van een Connector-rij nodig heeft. Subset van het Prisma-
 * model, zodat een test geen volledige Connector hoeft te bouwen. */
export interface SyncConnector {
  id: string;
  user_id: string;
  provider: string;
  type: string;
  account_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: Date | null;
  last_sync_at: Date | null;
}

/** De kolommen die de engine schrijft, los van de precieze Prisma-types —
 * ook dat is voor testbaarheid: een fake tx hoeft geen Prisma te importeren. */
export interface SyncTx {
  event: {
    upsert(args: {
      where: { user_id_external_id: { user_id: string; external_id: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
  };
  email: {
    upsert(args: {
      where: { user_id_external_id: { user_id: string; external_id: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
  };
  connector: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

export type SyncStatus = "synced" | "reauth_required" | "error";

export interface SyncOutcome {
  provider: string;
  connectorId: string;
  status: SyncStatus;
  count: number;
  message?: string;
}

/**
 * Onderscheidt een auth-probleem (connector moet opnieuw gekoppeld worden)
 * van een gewone fout (volgende tick opnieuw proberen). `ReauthRequiredError`
 * komt uit src/lib/auth/google-token.ts; op de naam vergeleken en niet op
 * `instanceof`, want die fout kan uit een andere modulekopie komen (net als
 * in src/lib/tools/execute.ts::asToolError).
 */
export function classifySyncError(err: unknown): { authProblem: boolean; message: string } {
  if (err instanceof Error && err.name === "ReauthRequiredError") {
    return { authProblem: true, message: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { authProblem: /\b401\b|invalid_grant|unauthorized/i.test(message), message };
}

/** Pure mapping: NormalizedEvent → Event-kolommen. */
export function eventRow(
  e: NormalizedEvent,
  userId: string,
  connectorId: string,
): Record<string, unknown> {
  return {
    user_id: userId,
    connector_id: connectorId,
    external_id: e.id,
    title: e.title,
    description: e.description ?? null,
    start_at: e.start,
    end_at: e.end,
    timezone: e.timezone,
    attendees: JSON.stringify(e.attendees ?? []),
    location: e.location ?? null,
    meeting_url: e.meeting_url ?? null,
    status: e.status,
    transparency: e.transparency,
    is_private: e.is_private ?? false,
  };
}

/** Pure mapping: NormalizedEmail → Email-kolommen. */
export function emailRow(
  e: NormalizedEmail,
  userId: string,
  connectorId: string,
): Record<string, unknown> {
  return {
    user_id: userId,
    connector_id: connectorId,
    external_id: e.id,
    thread_id: e.thread_id,
    subject: e.subject,
    from_addr: e.from.email,
    to_addrs: JSON.stringify(e.to.map((t) => t.email)),
    sent_at: e.sent_at,
    body_text: e.body_text,
    is_sent: e.is_sent,
    is_unread: e.is_unread,
    labels: JSON.stringify(e.labels ?? []),
  };
}

/**
 * Token + delta ophalen bij de bron. Geen tx hier — puur netwerkwerk (zie
 * toelichting bovenaan dit bestand). Gooit door wat de adapter of
 * ensureAccessToken gooit; de aanroeper classificeert en schrijft weg.
 */
export async function fetchConnectorDelta(
  adapter: ConnectorAdapter<unknown>,
  connector: SyncConnector,
): Promise<Array<NormalizedEvent | NormalizedEmail>> {
  const accessToken = adapter.ensureAccessToken
    ? await adapter.ensureAccessToken(connector)
    : decryptOptional(connector.access_token);

  const ctx: AdapterContext = {
    userId: connector.user_id,
    connectorId: connector.id,
    accountId: connector.account_id,
    accessToken,
    refreshToken: decryptOptional(connector.refresh_token),
  };

  const items = await adapter.fetchDelta(ctx, connector.last_sync_at ?? undefined);
  return items as Array<NormalizedEvent | NormalizedEmail>;
}

/**
 * Upsert de opgehaalde items en zet de connector op `active` — één kort
 * tx-blok, ná het netwerkwerk.
 */
export async function applySyncedItems(
  tx: SyncTx,
  connector: SyncConnector,
  items: Array<NormalizedEvent | NormalizedEmail>,
  now: Date,
): Promise<void> {
  for (const item of items) {
    if (connector.type === "calendar") {
      const row = eventRow(item as NormalizedEvent, connector.user_id, connector.id);
      await tx.event.upsert({
        where: {
          user_id_external_id: { user_id: connector.user_id, external_id: row.external_id as string },
        },
        create: row,
        update: row,
      });
    } else if (connector.type === "mail") {
      const row = emailRow(item as NormalizedEmail, connector.user_id, connector.id);
      await tx.email.upsert({
        where: {
          user_id_external_id: { user_id: connector.user_id, external_id: row.external_id as string },
        },
        create: row,
        update: row,
      });
    }
    // Ander type (bank, chat, push): deze engine kent alleen calendar/mail in
    // fase 0 — google en gmail zijn de enige syncbare providers.
  }

  await tx.connector.update({
    where: { id: connector.id },
    data: { status: "active", error_message: null, last_sync_at: now },
  });
}

/**
 * Zet de connector op de juiste foutstand. Auth-probleem → `reauth_required`
 * (de briefing meldt dit al als degraded, CLAUDE.md-regel 2); andere fout →
 * `error`, zodat de volgende tick het opnieuw probeert zonder dat de
 * gebruiker iets hoeft te doen.
 */
export async function recordSyncFailure(
  tx: SyncTx,
  connector: SyncConnector,
  err: unknown,
): Promise<{ authProblem: boolean; message: string }> {
  const classified = classifySyncError(err);
  await tx.connector.update({
    where: { id: connector.id },
    data: {
      status: classified.authProblem ? "reauth_required" : "error",
      error_message: clamp(classified.message, "connectorStatus"),
    },
  });
  return classified;
}

/**
 * Eén connector synchroniseren: ophalen, wegschrijven, of de foutstand
 * vastleggen. `withTx` is de enige plek waar dit bestand een database raakt,
 * en die zit achter een parameter — in productie `(fn) => withUser(connector
 * .user_id, fn)`, in een test een functie die een neppe `SyncTx` teruggeeft.
 */
export async function syncConnector(params: {
  adapter: ConnectorAdapter<unknown>;
  connector: SyncConnector;
  withTx: <T>(fn: (tx: SyncTx) => Promise<T>) => Promise<T>;
  now?: Date;
}): Promise<SyncOutcome> {
  const { adapter, connector, withTx } = params;
  const now = params.now ?? new Date();

  let items: Array<NormalizedEvent | NormalizedEmail>;
  try {
    items = await fetchConnectorDelta(adapter, connector);
  } catch (err) {
    const classified = await withTx((tx) => recordSyncFailure(tx, connector, err));
    return {
      provider: connector.provider,
      connectorId: connector.id,
      status: classified.authProblem ? "reauth_required" : "error",
      count: 0,
      message: classified.message,
    };
  }

  await withTx((tx) => applySyncedItems(tx, connector, items, now));
  return {
    provider: connector.provider,
    connectorId: connector.id,
    status: "synced",
    count: items.length,
  };
}
