import { clamp } from "@/lib/text";
import { MODELS, extractCommitmentsPrompt } from "./prompts";
import type { LlmCaller } from "./llm";

/**
 * Commitment-extractie: voor elke ongeziene mail (`Email.processed_at IS
 * NULL`) laat Haiku bepalen of er een belofte in zit (§Appendix A).
 *
 * Zelfde twee lagen als src/lib/sync/engine.ts:
 *  - `planExtractions` doet het netwerkwerk (één modelaanroep per mail) en
 *    raakt geen database aan — dat maakt 'm testbaar met een gemockte
 *    `LlmCaller` en geeft per mail een eigen foutisolatie: één kapotte
 *    aanroep blokkeert de rest van de batch niet.
 *  - `applyExtractionPlan` schrijft het resultaat weg in een kort tx-blok dat
 *    de aanroeper meegeeft (net als `withTx` bij de sync-engine).
 *
 * Een mail waarvan de aanroep mislukt (geen key, HTTP-fout, kapotte JSON)
 * blijft op `processed_at: NULL` staan — de eerstvolgende tick probeert 'm
 * opnieuw. Een mail waarvan het model "none" concludeert (of iets onbruikbaars
 * teruggeeft) wordt wél gemarkeerd: er is echt naar gekeken, er kwam alleen
 * niets uit.
 */

export const MAX_EMAILS_PER_USER_PER_TICK = 25;
const MAX_TOKENS_EXTRACT = 500;

export interface EmailToExtract {
  id: string;
  subject: string;
  from_addr: string;
  is_sent: boolean;
  body_text: string;
  sent_at: Date;
}

export type CommitmentDirection = "i_owe" | "they_owe";

export interface ExtractionDecision {
  direction: CommitmentDirection;
  party: string;
  what: string;
  context: string | null;
  due_date: Date | null;
  confidence: number;
}

export interface PlannedExtraction {
  email: EmailToExtract;
  /** null = geen belofte gevonden (of onbruikbaar antwoord) — toch markeren. */
  decision: ExtractionDecision | null;
  /** true = de aanroep zelf ging mis — niet markeren, volgende tick opnieuw. */
  failed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Pure: valideert en normaliseert het modelantwoord. Geeft `null` terug bij
 * "none", een onbekende direction, of ontbrekende velden — liever geen rij
 * dan giswerk (dezelfde streng-zijn-instructie als in de prompt zelf: een
 * lijst die vol ruis staat wordt genegeerd).
 */
export function parseExtractionJson(json: unknown): ExtractionDecision | null {
  if (!isRecord(json)) return null;

  const direction = json.direction;
  if (direction !== "i_owe" && direction !== "they_owe") return null;

  const party = typeof json.party === "string" ? json.party.trim() : "";
  const what = typeof json.what === "string" ? json.what.trim() : "";
  if (!party || !what) return null;

  const context =
    typeof json.context === "string" && json.context.trim().length > 0 ? json.context.trim() : null;

  const dueDateRaw = typeof json.due_date === "string" ? json.due_date : null;
  const dueDateParsed = dueDateRaw ? new Date(dueDateRaw) : null;
  const due_date = dueDateParsed && !Number.isNaN(dueDateParsed.getTime()) ? dueDateParsed : null;

  const confidence =
    typeof json.confidence === "number" && json.confidence >= 0 && json.confidence <= 1
      ? json.confidence
      : 0.5;

  return { direction, party, what, context, due_date, confidence };
}

/**
 * Pure mapping: extractiebesluit + mail → Commitment-kolommen. Zelfde vorm
 * als eventRow/emailRow in de sync-engine. Budgetten: "what" en "context"
 * staan al met hun sleutel in de prompt (src/brain/prompts.ts); "party" heeft
 * geen eigen slot in de tabel in DESIGN.md — het is dezelfde modelaanroep als
 * "what", dus hergebruikt hij looseEndTitle in plaats van ongebound te blijven.
 */
export function commitmentRow(
  decision: ExtractionDecision,
  email: EmailToExtract,
  userId: string,
  now: Date,
): Record<string, unknown> {
  return {
    user_id: userId,
    source: "email",
    source_ref: email.id,
    source_label: `mail ${formatDayMonth(email.sent_at)}`,
    direction: decision.direction,
    party: clamp(decision.party, "looseEndTitle"),
    what: clamp(decision.what, "looseEndTitle"),
    context: decision.context ? clamp(decision.context, "looseEndDescription") : null,
    due_date: decision.due_date,
    opened_at: now,
    confidence: decision.confidence,
  };
}

/** "8/7" — dag/maand, zoals de bestaande source_label-voorbeelden in prisma/seed.ts. */
function formatDayMonth(d: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(d);
}

/**
 * Netwerkwerk: per mail het model bevragen. Geen tx-toegang — zie de
 * toelichting bovenaan dit bestand. `llmCall` is `callAnthropic` in productie
 * en een mock in tests.
 */
export async function planExtractions(
  emails: EmailToExtract[],
  llmCall: LlmCaller,
): Promise<PlannedExtraction[]> {
  const plans: PlannedExtraction[] = [];

  for (const email of emails) {
    try {
      const result = await llmCall({
        prompt: extractCommitmentsPrompt({
          subject: email.subject,
          from: email.from_addr,
          body: email.body_text,
          is_sent: email.is_sent,
        }),
        model: MODELS.extract,
        maxTokens: MAX_TOKENS_EXTRACT,
      });

      if (!result.ok) {
        plans.push({ email, decision: null, failed: true });
        continue;
      }
      plans.push({ email, decision: parseExtractionJson(result.json), failed: false });
    } catch {
      // Onverwachte fout in de aanroep zelf (niet via het LlmResult-pad) —
      // ook dan isoleren: deze mail blijft onverwerkt, de rest van de batch
      // niet.
      plans.push({ email, decision: null, failed: true });
    }
  }

  return plans;
}

/** Wat applyExtractionPlan van een tx nodig heeft — smal, zoals SyncTx. */
export interface ExtractTx {
  commitment: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  email: {
    update(args: { where: { id: string }; data: { processed_at: Date } }): Promise<unknown>;
  };
}

export interface ApplyOutcome {
  created: number;
  skipped: number;
}

/**
 * Schrijfwerk: commitments aanmaken en processed_at zetten. Ná het
 * netwerkwerk, in het korte tx-blok dat de aanroeper meegeeft — net als
 * applySyncedItems() in src/lib/sync/engine.ts.
 */
export async function applyExtractionPlan(
  tx: ExtractTx,
  userId: string,
  plans: PlannedExtraction[],
  now: Date,
): Promise<ApplyOutcome> {
  let created = 0;
  let skipped = 0;

  for (const plan of plans) {
    if (plan.failed) {
      skipped++;
      continue;
    }
    if (plan.decision) {
      await tx.commitment.create({ data: commitmentRow(plan.decision, plan.email, userId, now) });
      created++;
    }
    await tx.email.update({ where: { id: plan.email.id }, data: { processed_at: now } });
  }

  return { created, skipped };
}
