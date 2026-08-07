/**
 * Registry van escalatietriggers.
 *
 * De briefing (ochtend/middag/avond) is het standaardritme; escalatie is de
 * laag daarboven die een klein aantal dingen mag laten storen buiten dat
 * ritme om. Elke trigger hier is dus een uitzondering, geen aanvulling — een
 * nieuwe trigger toevoegen zonder detector is prima (zie `children` en
 * `housing_longterm` hieronder), maar hij hoort dan wel `enabled: false` te
 * zijn: een trigger die in de lijst staat maar niets doet mag nooit doen
 * alsof hij actief is.
 *
 * Twee triggers zijn nu echt geïmplementeerd. Allebei feitelijk: geen mening
 * over of iets "erg genoeg" is, alleen een controleerbare voorwaarde
 * (deadline binnen 24 uur, een transactie die om controle vraagt). Zie
 * engine.ts voor dedupe, dagcap en stille uren — dat hoort niet hier.
 */

export type TriggerId = "deadline_24h" | "money_unexpected" | "children" | "housing_longterm";

export interface TriggerDefinition {
  id: TriggerId;
  label: string;
  description: string;
  /** false = staat in de lijst voor de volledigheid, heeft geen detector. */
  enabled: boolean;
}

export const TRIGGERS: TriggerDefinition[] = [
  {
    id: "deadline_24h",
    label: "Deadline binnen 24 uur",
    description: "Een openstaande belofte met een uiterste datum die binnen 24 uur verloopt.",
    enabled: true,
  },
  {
    id: "money_unexpected",
    label: "Onverwachte transactie",
    description: "Een banktransactie die niet automatisch te categoriseren was en om controle vraagt.",
    enabled: true,
  },
  {
    id: "children",
    label: "Kinderen",
    description:
      "Gereserveerd voor een toekomstige trigger rond zorg voor kinderen. Nog geen detector — staat hier alleen zodat de registry eerlijk laat zien wat er nog niet is.",
    enabled: false,
  },
  {
    id: "housing_longterm",
    label: "Langetermijn wonen",
    description:
      "Gereserveerd voor een toekomstige trigger rond een woningkans voor de lange termijn. Nog geen detector.",
    enabled: false,
  },
];

/** Wat de detectors nodig hebben van een Commitment — smal, geen volledige Prisma-rij. */
export interface CommitmentCandidate {
  id: string;
  status: string;
  due_date: Date | null;
}

/** Wat de detectors nodig hebben van een Transaction. */
export interface TransactionCandidate {
  id: string;
  needs_review: boolean;
}

export interface EscalationCandidate {
  trigger: TriggerId;
  /** id van het bronrecord — de dedupe-sleutel samen met trigger + user_id. */
  ref_id: string;
  /**
   * NL, kort en discreet. Nooit een bedrag of een naam van een schuldeiser —
   * dat blijft in de app, niet in een melding (§Privacy in CLAUDE.md, en de
   * instelling `sensitive_in_push`). Dat is hier een eigenschap van de tekst
   * zelf, niet iets wat later nog weggefilterd moet worden.
   */
  message: string;
}

const DEADLINE_MESSAGE = "Een belofte met een deadline binnen 24 uur staat nog open.";
const MONEY_MESSAGE = "Er wacht een transactie op je controle.";

/**
 * Pure detector: welke open commitments hebben een due_date die vanaf `now`
 * binnen 24 uur ligt? Al verlopen (due_date in het verleden) hoort bij de
 * eerstvolgende briefing, niet bij escalatie — dat moment is al voorbij, dus
 * storen heeft geen zin meer.
 */
export function detectDeadline24h(
  commitments: CommitmentCandidate[],
  now: Date,
): EscalationCandidate[] {
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return commitments
    .filter((c) => c.status === "open" && c.due_date !== null && c.due_date > now && c.due_date <= in24h)
    .map((c) => ({ trigger: "deadline_24h" as const, ref_id: c.id, message: DEADLINE_MESSAGE }));
}

/** Pure detector: transacties die needs_review dragen. */
export function detectMoneyUnexpected(transactions: TransactionCandidate[]): EscalationCandidate[] {
  return transactions
    .filter((t) => t.needs_review)
    .map((t) => ({ trigger: "money_unexpected" as const, ref_id: t.id, message: MONEY_MESSAGE }));
}
