/**
 * Genormaliseerd connector-schema (Appendix A van de design-briefing).
 *
 * Elke adapter in src/connectors/ levert naar dít schema. De brain-laag en de
 * graaf-bouwer praten alleen met deze types — nooit met provider-payloads.
 * Nieuwe bron toevoegen = nieuwe adapter, geen wijziging aan schermen of API.
 */

export type Provider =
  | "google"
  | "outlook"
  | "caldav"
  | "apple"
  | "gmail"
  | "imap"
  | "ponto"
  | "telegram";

export type ConnectorType = "calendar" | "mail" | "bank" | "chat" | "push";

/** Permissiegradiënt per connector (§6.7). */
export type Permission = "propose" | "draft" | "act_and_report" | "silent";

export const PERMISSION_LABELS: Record<Permission, string> = {
  propose: "voorstellen",
  draft: "concept maken",
  act_and_report: "doen en melden",
  silent: "stil doen",
};

export interface NormalizedEvent {
  id: string;
  provider: Extract<Provider, "google" | "outlook" | "caldav" | "apple">;
  calendar_id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  timezone: string;
  attendees?: Array<{
    email: string;
    name?: string;
    status: "accepted" | "declined" | "tentative";
  }>;
  location?: string;
  meeting_url?: string;
  recurring?: string; // RFC 5545 RRULE
  status: "confirmed" | "tentative" | "cancelled";
  transparency: "opaque" | "transparent";
  is_private?: boolean;
  raw: unknown;
  synced_at: Date;
}

export interface NormalizedEmail {
  id: string;
  provider: Extract<Provider, "gmail" | "outlook" | "imap">;
  account_id: string;
  thread_id: string;
  subject: string;
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  sent_at: Date;
  received_at: Date;
  body_text: string;
  body_html?: string;
  in_reply_to?: string;
  references?: string[];
  labels?: string[];
  is_sent: boolean;
  is_unread: boolean;
  attachments?: Array<{ filename: string; mime: string; size: number; id: string }>;
  raw: unknown;
  synced_at: Date;
}

export interface NormalizedTransaction {
  id: string;
  provider: Extract<Provider, "ponto">;
  account_id: string;
  bank_account: { iban: string; name: string; currency: string };
  amount: number; // + = bij, - = af
  currency: string;
  booked_at: Date;
  value_date?: Date;
  counterparty?: { name: string; iban?: string; bic?: string };
  remittance_information?: string;
  category?: string;
  category_confidence?: number;
  transaction_type:
    | "transfer"
    | "card"
    | "direct_debit"
    | "standing_order"
    | "fee"
    | "interest"
    | "other";
  status: "booked" | "pending";
  raw: unknown;
  synced_at: Date;
}

export type CommitmentDirection = "i_owe" | "they_owe" | "mutual" | "unknown";

export interface NormalizedCommitment {
  id: string;
  source: "email" | "calendar" | "chat" | "manual" | "voice" | "inference";
  source_ref: string;
  source_label?: string;
  direction: CommitmentDirection;
  party: string;
  party_contact?: string;
  what: string;
  context?: string;
  due_date?: Date;
  inferred_due_date?: Date;
  opened_at: Date;
  status: "open" | "done" | "dismissed" | "delegated" | "snoozed";
  last_nudge_at?: Date;
  nudge_count: number;
  created_at: Date;
  updated_at: Date;
  confidence: number;
  raw: unknown;
}

export interface NormalizedPerson {
  id: string;
  name: string;
  emails: string[];
  phones?: string[];
  organizations?: string[];
  roles?: string[];
  frequency_score: number;
  last_contact_at?: Date;
  source_refs: Array<{ provider: string; ref: string }>;
  notes?: string;
}

export interface NormalizedProject {
  id: string;
  name: string;
  description?: string;
  status: "active" | "on_hold" | "done" | "archived";
  people: string[];
  commitments: string[];
  transactions: string[];
  events: string[];
  emails: string[];
  created_at: Date;
  updated_at: Date;
}

/** Wat elke adapter moet kunnen. Delta-sync op basis van synced_at. */
export interface ConnectorAdapter<T> {
  provider: Provider;
  type: ConnectorType;
  /** Haal alles op dat veranderde sinds `since`. */
  fetchDelta(ctx: AdapterContext, since?: Date): Promise<T[]>;
  /** Draait de connector nog? Geeft ook consent-vervaldatum terug (PSD2). */
  health(ctx: AdapterContext): Promise<ConnectorHealth>;
}

export interface AdapterContext {
  userId: string;
  connectorId: string;
  accountId: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface ConnectorHealth {
  status: "active" | "error" | "reauth_required" | "not_connected";
  last_sync_at?: Date;
  consent_expires_at?: Date;
  error_message?: string;
}

/** Wat het Vandaag-scherm nodig heeft — één response, één render. */
export interface BriefingToday {
  date: string; // yyyy-mm-dd
  frog: {
    id: string;
    title: string;
    sub?: string;
    implement?: string;
    status: "open" | "done" | "deferred";
  } | null;
  coach_text: string;
  priorities: Array<{ id: string; text: string; done: boolean }>;
  timeline: Array<{
    id: string;
    start: string;
    end: string;
    title: string;
    conflict_with?: string;
    is_private: boolean;
  }>;
  confirmations: Array<{ id: string; text: string; answered: boolean }>;
  degraded: Array<{ connector: string; message: string }>;
  state: "empty" | "normal" | "degraded" | "clear";
}
