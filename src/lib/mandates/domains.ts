/**
 * Domeinregister — fase 1 van het mandaatmodel.
 *
 * Vervangt de permissiegradiënt per connector (vier standen, op de
 * Connector-rij) door drie niveaus per domein (op de nieuwe Mandate-rij).
 * "Domein" is een groep van dingen die Wingman kan dóén die voor de gebruiker
 * hetzelfde soort vraag oproepen — "mag je mijn agenda vullen?" is één vraag,
 * ook als daar straks een tweede agendabron bij komt. Een connector kent zijn
 * eigen domeinen niet; een `ConnectorTool` (src/lib/tools/types.ts) draagt een
 * `domain`, en dit bestand is de enige plek die uitlegt wat dat woord betekent.
 *
 * Uitbreiden: nieuw domein = nieuwe regel in `Domain` + `DOMAIN_REGISTRY`, en
 * het `domain`-veld op de tools die eronder vallen. `finance` (Bunq-drafts) en
 * `messages` (WhatsApp/Telegram) komen later; niets hieronder gaat daarvoor op
 * de schop.
 */

export type Domain = "calendar" | "email_send";

export interface DomainInfo {
  /** Kop in Instellingen en de onboarding. */
  label: string;
  /** Eén regel in gewone taal — wat dit domein voor de gebruiker betekent. */
  description: string;
}

export const DOMAIN_REGISTRY: Record<Domain, DomainInfo> = {
  calendar: {
    label: "Agenda",
    description: "Je agenda bekijken en er afspraken in zetten.",
  },
  email_send: {
    label: "Mail",
    description: "Concept-antwoorden klaarzetten in je mailbox. Versturen doe jij altijd zelf.",
  },
};

export const DOMAINS: Domain[] = Object.keys(DOMAIN_REGISTRY) as Domain[];

export function isDomain(value: string): value is Domain {
  return (DOMAINS as string[]).includes(value);
}

/**
 * Drie niveaus, per domein — vervangt de vier standen van de oude
 * permissiegradiënt (propose/draft/act_and_report/silent) uit §6.7.
 *
 *  1 signaleren   alleen lezen; elke actie wordt een voorstel.
 *  2 klaarzetten  draft-effecten zelfstandig, write vraagt een ja.
 *  3 doen         draft én write zelfstandig; melden is een voorkeur.
 */
export type MandateLevel = 1 | 2 | 3;

export const LEVELS: MandateLevel[] = [1, 2, 3];

export const LEVEL_LABELS: Record<MandateLevel, string> = {
  1: "Signaleren",
  2: "Klaarzetten",
  3: "Doen",
};

/** Alleen deze drie zijn geldig; de database bewaart een los getal. */
export function asLevel(value: number | string | null | undefined): MandateLevel {
  const n = typeof value === "string" ? Number(value) : value;
  return n === 2 || n === 3 ? n : 1; // onherkenbaar of leeg = de voorzichtigste stand
}

/**
 * "Melden achteraf" bij niveau 3. Geen apart niveau meer (zoals het oude
 * "stil doen" dat was) — een voorkeur per domein, in `Mandate.rules`.
 */
export type NotifyPreference = "melden" | "stil";

export function asNotifyPreference(value: string | null | undefined): NotifyPreference {
  return value === "stil" ? "stil" : "melden";
}

export interface ResolvedMandate {
  level: MandateLevel;
  notifyPreference: NotifyPreference;
}

/** Geen Mandate-rij voor een domein = niveau 1, de voorzichtigste stand. */
export const DEFAULT_MANDATE: ResolvedMandate = { level: 1, notifyPreference: "melden" };

/**
 * De voorzichtigste van een rij niveaus — het mostRestrictive-principe uit de
 * oude onboarding (src/lib/onboarding/steps.ts), nu op niveaus in plaats van
 * op de vier oude permissienamen. Leeg = niveau 1: wie op "Volgende" drukt
 * zonder dat er ooit een mandaat is ingesteld, hoort niets ruimers te krijgen
 * dan de voorzichtigste stand.
 */
export function mostRestrictiveLevel(levels: MandateLevel[]): MandateLevel {
  if (levels.length === 0) return 1;
  return levels.reduce((lowest, level) => (level < lowest ? level : lowest), 3 as MandateLevel);
}
