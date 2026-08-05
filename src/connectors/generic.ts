import type {
  AdapterContext,
  ConnectorAdapter,
  ConnectorHealth,
  NormalizedEmail,
  NormalizedEvent,
} from "@/lib/types";

/**
 * Generieke vangnet-adapters: CalDAV (Apple/Fastmail/Nextcloud) en IMAP.
 *
 * Deze twee bestaan zodat "mijn agenda zit niet bij Google of Microsoft" geen
 * doodlopende weg is in de onboarding. Ze draaien niet in de browser: CalDAV
 * (REPORT/XML) en IMAP (TCP) horen in de Inngest-worker, niet in een route
 * handler. De implementatie zit daarom in workers/, deze adapters zijn de
 * contractkant die de kern kent.
 */

export const caldav: ConnectorAdapter<NormalizedEvent> = {
  provider: "caldav",
  type: "calendar",

  async fetchDelta(ctx: AdapterContext): Promise<NormalizedEvent[]> {
    if (!ctx.accessToken) return [];
    throw new Error(
      "CalDAV-sync draait in de worker (workers/sync-connectors.ts), niet in een request.",
    );
  },

  async health(ctx: AdapterContext): Promise<ConnectorHealth> {
    return ctx.accessToken ? { status: "active" } : { status: "not_connected" };
  },
};

export const imap: ConnectorAdapter<NormalizedEmail> = {
  provider: "imap",
  type: "mail",

  async fetchDelta(ctx: AdapterContext): Promise<NormalizedEmail[]> {
    if (!ctx.accessToken) return [];
    throw new Error(
      "IMAP-sync draait in de worker (workers/sync-connectors.ts), niet in een request.",
    );
  },

  async health(ctx: AdapterContext): Promise<ConnectorHealth> {
    return ctx.accessToken ? { status: "active" } : { status: "not_connected" };
  },
};
