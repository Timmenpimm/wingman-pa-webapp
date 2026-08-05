/**
 * Dagelijkse run, per gebruiker in de eigen tijdzone (Appendix B).
 *
 *   07:30  sync      — elke adapter levert delta sinds last_sync_at
 *   07:35  extractie — Haiku: mails → commitments, transacties → categorie
 *   07:45  graaf     — nodes/edges bijwerken, snapshot-diff met gisteren
 *   07:55  coaching  — Sonnet: frog + coachregel binnen budget
 *   08:00  push      — web push, mail als vangnet
 *
 * Waarom Inngest en geen rauwe cron: dit moet per gebruiker idempotent zijn en
 * retrybaar per stap. Een mislukte mail-sync mag de briefing niet blokkeren —
 * hij moet dan doorgaan en zichzelf als incompleet markeren (§9.3), want een
 * stille halve briefing is erger dan een late.
 *
 * Nog niet aangesloten: dev draait op seed-data. Zet INNGEST_EVENT_KEY en
 * ANTHROPIC_API_KEY om dit te activeren.
 */

export const MORNING_CRON = "30 7 * * *";

export interface ScanResult {
  userId: string;
  synced: Record<string, number>;
  failed: Array<{ connector: string; reason: string }>;
  briefingId?: string;
}

export async function morningScan(_userId: string): Promise<ScanResult> {
  throw new Error(
    "Worker nog niet aangesloten. Zie Appendix B: sync → extractie → graaf → coaching → push.",
  );
}
