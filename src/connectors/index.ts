/**
 * Adapter-registry.
 *
 * De kern kent alleen deze registry — geen enkel scherm of endpoint importeert
 * een provider direct. Een nieuwe bron (WhatsApp, Slack, Notion) toevoegen is:
 * bestand in deze map + één regel in ADAPTERS. Geen wijziging in brain/, api/
 * of components/.
 */

import type { ConnectorAdapter, ConnectorType, Provider } from "@/lib/types";
import { googleCalendar } from "./google-calendar";
import { gmail } from "./gmail";
import { pontoBanking } from "./ponto-banking";
import { caldav, imap } from "./generic";

export const ADAPTERS: Record<string, ConnectorAdapter<unknown>> = {
  google: googleCalendar as ConnectorAdapter<unknown>,
  gmail: gmail as ConnectorAdapter<unknown>,
  ponto: pontoBanking as ConnectorAdapter<unknown>,
  caldav: caldav as ConnectorAdapter<unknown>,
  imap: imap as ConnectorAdapter<unknown>,
};

export function adapterFor(provider: Provider): ConnectorAdapter<unknown> | undefined {
  return ADAPTERS[provider];
}

/** Catalogus voor het onboarding-scherm (§6.3). */
export const CONNECTOR_CATALOG: Array<{
  provider: Provider;
  type: ConnectorType;
  label: string;
  step: number;
  note?: string;
}> = [
  { provider: "google", type: "calendar", label: "Google Agenda", step: 1 },
  { provider: "caldav", type: "calendar", label: "Apple / CalDAV", step: 1 },
  { provider: "gmail", type: "mail", label: "Gmail", step: 2 },
  { provider: "imap", type: "mail", label: "IMAP (overig)", step: 2 },
  {
    provider: "ponto",
    type: "bank",
    label: "Bank via Ponto",
    step: 3,
    note: "PSD2-consent verloopt na 90 dagen",
  },
  { provider: "telegram", type: "chat", label: "Telegram (optioneel)", step: 6 },
];

/**
 * In dev is er geen echte OAuth. Nango (of Paragon) doet in productie het
 * tokenbeheer; deze functie levert de redirect-URL waar /api/v1/connect/[provider]
 * naartoe stuurt.
 */
export function authUrlFor(provider: Provider): string | null {
  const base = process.env.NANGO_HOST;
  if (!base) return null;
  return `${base}/oauth/connect/${provider}?public_key=${process.env.NANGO_PUBLIC_KEY ?? ""}`;
}
