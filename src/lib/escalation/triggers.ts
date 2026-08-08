/**
 * Registry van escalatietriggers.
 *
 * De briefing (ochtend/middag/avond) is het standaardritme; escalatie is de
 * laag daarboven die een klein aantal dingen mag laten storen buiten dat
 * ritme om. Elke trigger hier is dus een uitzondering, geen aanvulling — een
 * nieuwe trigger toevoegen zonder detector is prima, maar hij hoort dan wel
 * `enabled: false` te zijn: een trigger die in de lijst staat maar niets doet
 * mag nooit doen alsof hij actief is.
 *
 * Alle vier triggers zijn nu geïmplementeerd. Allebei de eerste twee zijn
 * feitelijk: geen mening over of iets "erg genoeg" is, alleen een
 * controleerbare voorwaarde (deadline binnen 24 uur, een transactie die om
 * controle vraagt). `children` en `housing_longterm` zijn ook feitelijk, maar
 * de voorwaarde zelf (welke namen/contacten horen bij de kinderen, welke
 * prijsklasse/regio telt als langetermijn-woning) is persoonlijk — dat staat
 * daarom in configuratie (UserSetting), niet in deze code. Zie
 * ChildrenSignalConfig en HousingCriteria hieronder. Zie engine.ts voor
 * dedupe, dagcap en stille uren — dat hoort niet hier.
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
      "Een mail of agenda-item waarvan de afzender/deelnemer of het onderwerp op de kinderen wijst " +
      "(school, opvang, arts, de ex-partner), volgens de contacten en trefwoorden die de gebruiker " +
      "instelt in UserSetting-sleutel " +
      "\"escalation_children_signals\" (nog geen scherm hiervoor — zie ChildrenSignalConfig in dit bestand).",
    enabled: true,
  },
  {
    id: "housing_longterm",
    label: "Langetermijn wonen",
    description:
      "Een mail die een langetermijn-huurwoning beschrijft binnen de prijsklasse en regio die de " +
      "gebruiker instelt in UserSetting-sleutel \"escalation_housing_criteria\" (nog geen scherm " +
      "hiervoor — zie HousingCriteria in dit bestand). Tijdelijk/short-stay/anti-kraak/tussenhuur/" +
      "woningruil wordt uitgesloten, ongeacht de rest.",
    enabled: true,
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

/**
 * Wat de detectors nodig hebben van een Email — smal, geen volledige
 * Prisma-rij. `to_addrs` staat zoals in de kolom: JSON-array van
 * e-mailadres-strings (zie src/lib/sync/engine.ts, `JSON.stringify(e.to.map(...))`).
 */
export interface EmailCandidate {
  id: string;
  subject: string;
  from_addr: string;
  to_addrs: string;
  body_text: string;
}

/**
 * Wat de detectors nodig hebben van een Event. `attendees` staat zoals in de
 * kolom: JSON-array van `{email, name?, status?}` (zie
 * src/lib/sync/engine.ts, `JSON.stringify(e.attendees ?? [])`).
 */
export interface EventCandidate {
  id: string;
  title: string;
  attendees: string;
}

export interface EscalationCandidate {
  trigger: TriggerId;
  /** id van het bronrecord — de dedupe-sleutel samen met trigger + user_id. */
  ref_id: string;
  /**
   * NL, kort en discreet. Nooit een bedrag, naam of adres — dat blijft in de
   * app, niet in een melding (§Privacy in CLAUDE.md, en de instelling
   * `sensitive_in_push`). Dat is hier een eigenschap van de tekst zelf, niet
   * iets wat later nog weggefilterd moet worden.
   */
  message: string;
}

const DEADLINE_MESSAGE = "Een belofte met een deadline binnen 24 uur staat nog open.";
const MONEY_MESSAGE = "Er wacht een transactie op je controle.";
const CHILDREN_MESSAGE = "Er is een bericht dat met de kinderen te maken heeft.";
const HOUSING_MESSAGE = "Er is een woningkans die aan je langetermijncriteria voldoet.";

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

// ---------------------------------------------------------------------------
// children
// ---------------------------------------------------------------------------

/**
 * Instelling voor de `children`-trigger: welke afzenders/deelnemers en welke
 * onderwerp-trefwoorden op de kinderen wijzen. Bewust géén hardgecodeerde
 * namen in deze detector — dat zou precies het probleem zijn dat de
 * herkenning alleen voor één specifieke gebruiker (Martijn: Cecile/Oscar)
 * laat werken.
 *
 * Kleinste plek die past bij het bestaande schema: één UserSetting-rij
 * (sleutel CHILDREN_SIGNALS_SETTING_KEY) met deze vorm als JSON-string —
 * exact hoe `quiet_hours` en `sensitive_in_push` al werken. Geen nieuwe
 * tabel: dit is per gebruiker twee losse lijstjes zonder eigen relaties, en
 * er is al een sleutel/waarde-tabel voor precies dit soort instellingen.
 *
 * Nog niet ingesteld (geen rij, of een rij die niet parseert) → de detector
 * geeft niets terug; de trigger staat dan feitelijk "aan" in de registry maar
 * inert voor die gebruiker. Er is in deze wijziging bewust geen scherm om dit
 * in te stellen (src/app/(app)/instellingen/** valt buiten dit werkgebied) —
 * de rij moet voorlopig direct in UserSetting gezet worden, bijvoorbeeld:
 *
 * ```
 * INSERT INTO "UserSetting" (id, user_id, key, value) VALUES (
 *   'clx...', '<user_id>', 'escalation_children_signals',
 *   '{"contacts":["ex-partner@voorbeeld.nl","opvang@buurtcentrum.nl"],"keywords":["cecile","oscar","school","opvang","huisarts"]}'
 * );
 * ```
 */
export interface ChildrenSignalConfig {
  /**
   * E-mailadressen die met de kinderen te maken hebben: de ex-partner,
   * school, opvang, arts. Gematcht tegen afzender (Email.from_addr) en
   * deelnemers (Email.to_addrs / Event.attendees) — een substring-match,
   * hoofdletterongevoelig.
   */
  contacts: string[];
  /**
   * Trefwoorden die in een onderwerp of titel op de kinderen wijzen —
   * kindnamen incluis. Gematcht tegen Email.subject en Event.title, bewust
   * niet tegen de mailbody of event-omschrijving: dat houdt de kans op ruis
   * (een collega die toevallig "Oscar" heet, een nieuwsbrief met "school" in
   * de tekst) klein. Hoofdletterongevoelig substring-match.
   */
  keywords: string[];
}

export const CHILDREN_SIGNALS_SETTING_KEY = "escalation_children_signals";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Veilig parsen van de UserSetting-waarde — geen of kapotte configuratie geeft `null`, nooit een throw. */
export function parseChildrenSignalConfig(raw: string | null | undefined): ChildrenSignalConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChildrenSignalConfig>;
    const contacts = Array.isArray(parsed.contacts) ? parsed.contacts.filter(isNonEmptyString) : [];
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.filter(isNonEmptyString) : [];
    if (contacts.length === 0 && keywords.length === 0) return null;
    return { contacts, keywords };
  } catch {
    return null;
  }
}

/** `to_addrs`/`attendees` zijn ofwel een array van e-mailstrings, ofwel een array van `{email,...}`-objecten. */
function extractEmails(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && typeof (item as { email?: unknown }).email === "string") {
          return (item as { email: string }).email;
        }
        return null;
      })
      .filter((email): email is string => email !== null);
  } catch {
    return [];
  }
}

function includesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

/**
 * Pure detector: e-mails en agenda-items waarvan de afzender/deelnemer of het
 * onderwerp op de kinderen wijst, volgens de configuratie van de gebruiker.
 * Agenda-items rond de kids-dagen komen op dezelfde manier mee: een
 * afspraak met de ex-partner als deelnemer, of een titel met een kindnaam
 * erin, is precies zo'n item — er is geen apart schema voor een
 * omgangsregeling, dus dit is het beste signaal dat met de bestaande
 * Event-data te trekken is.
 */
export function detectChildren(
  emails: EmailCandidate[],
  events: EventCandidate[],
  config: ChildrenSignalConfig | null,
): EscalationCandidate[] {
  if (!config) return [];

  const emailMatches = emails
    .filter((e) => {
      const participants = [e.from_addr, ...extractEmails(e.to_addrs)];
      return (
        participants.some((p) => includesAny(p, config.contacts)) || includesAny(e.subject, config.keywords)
      );
    })
    .map((e) => ({ trigger: "children" as const, ref_id: `email:${e.id}`, message: CHILDREN_MESSAGE }));

  const eventMatches = events
    .filter((ev) => {
      const attendeeEmails = extractEmails(ev.attendees);
      return (
        attendeeEmails.some((a) => includesAny(a, config.contacts)) || includesAny(ev.title, config.keywords)
      );
    })
    .map((ev) => ({ trigger: "children" as const, ref_id: `event:${ev.id}`, message: CHILDREN_MESSAGE }));

  return [...emailMatches, ...eventMatches];
}

// ---------------------------------------------------------------------------
// housing_longterm
// ---------------------------------------------------------------------------

/**
 * Instelling voor de `housing_longterm`-trigger. Net als de kindnamen zijn
 * prijsklasse en regio persoonlijk — hardcoderen zou hetzelfde probleem zijn.
 * Zelfde opslagkeuze als ChildrenSignalConfig: één UserSetting-rij (sleutel
 * HOUSING_CRITERIA_SETTING_KEY), nog geen scherm. Voorbeeldwaarde (Martijns
 * eigen criteria, zie CLAUDE.md "Woning"):
 *
 * ```
 * INSERT INTO "UserSetting" (id, user_id, key, value) VALUES (
 *   'clx...', '<user_id>', 'escalation_housing_criteria',
 *   '{"minRent":1400,"maxRent":1800,"locations":["amsterdam","amstelveen","diemen","zaandam","duivendrecht"],"minDurationMonths":12}'
 * );
 * ```
 */
export interface HousingCriteria {
  minRent: number;
  maxRent: number;
  /** Plaatsnamen die tellen als "Amsterdam + rand" — vrije lijst, hoofdletterongevoelige substring-match tegen de mailtekst. */
  locations: string[];
  /** Minimale contractduur in maanden om als langetermijn te tellen. "Onbepaalde tijd" telt sowieso, los van dit getal. */
  minDurationMonths: number;
}

export const HOUSING_CRITERIA_SETTING_KEY = "escalation_housing_criteria";

/** Veilig parsen van de UserSetting-waarde — geen of kapotte configuratie geeft `null`, nooit een throw. */
export function parseHousingCriteria(raw: string | null | undefined): HousingCriteria | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HousingCriteria>;
    const minRent = typeof parsed.minRent === "number" ? parsed.minRent : null;
    const maxRent = typeof parsed.maxRent === "number" ? parsed.maxRent : null;
    const minDurationMonths = typeof parsed.minDurationMonths === "number" ? parsed.minDurationMonths : null;
    const locations = Array.isArray(parsed.locations) ? parsed.locations.filter(isNonEmptyString) : [];
    if (minRent === null || maxRent === null || minDurationMonths === null || locations.length === 0) {
      return null;
    }
    return { minRent, maxRent, minDurationMonths, locations };
  } catch {
    return null;
  }
}

const HOUSING_NEGATIVE_KEYWORDS = [
  "tijdelijk",
  "short stay",
  "shortstay",
  "anti-kraak",
  "antikraak",
  "tussenhuur",
  "woningruil",
];

const ONBEPAALDE_TIJD_RE = /onbepaalde\s*tijd/i;
const DURATION_RE = /(\d+)\s*(maanden|maand|jaren|jaar)\b/gi;
// € 1.450 / €1450 / 1.450 euro / 1450 eur / 1450 p/m / 1450 per maand.
const AMOUNT_RE = /€\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)|(\d{3,5})\s*(?:euro|eur|p\/m|per maand)/gi;

/**
 * "1.450" -> 1450, "1450" -> 1450, "1.450,50" -> 1450.5 — Europese notatie
 * (punt als duizendtal, komma als decimaal).
 */
function parseRentAmount(raw: string): number | null {
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function hasLongTermDuration(lower: string, minDurationMonths: number): boolean {
  if (ONBEPAALDE_TIJD_RE.test(lower)) return true;

  for (const match of Array.from(lower.matchAll(DURATION_RE))) {
    const amount = Number(match[1]);
    const months = match[2].startsWith("jaar") ? amount * 12 : amount;
    if (months >= minDurationMonths) return true;
  }
  return false;
}

function hasRentInRange(text: string, minRent: number, maxRent: number): boolean {
  for (const match of Array.from(text.matchAll(AMOUNT_RE))) {
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    const amount = parseRentAmount(raw);
    if (amount !== null && amount >= minRent && amount <= maxRent) return true;
  }
  return false;
}

/**
 * Bepaalt of één mail een langetermijn-woningkans is die aan de criteria
 * voldoet. Alle voorwaarden moeten kloppen — bewust streng: "weg is weg"
 * rechtvaardigt een directe melding buiten het briefingritme om, maar alleen
 * als het er ook echt naar ruikt. Volgorde: eerst uitsluiten (tijdelijk/
 * short-stay/anti-kraak/tussenhuur/woningruil), dan pas de positieve criteria
 * — een tijdelijke aanbieding die toevallig ook "onbepaalde tijd" ergens
 * anders in de tekst noemt (bijv. een linkje naar het eigen langetermijn-
 * aanbod van de makelaar) moet hoe dan ook wegvallen.
 */
function isLongTermHousingOpportunity(text: string, config: HousingCriteria): boolean {
  const lower = text.toLowerCase();

  if (HOUSING_NEGATIVE_KEYWORDS.some((word) => lower.includes(word))) return false;
  if (!hasLongTermDuration(lower, config.minDurationMonths)) return false;
  if (!includesAny(text, config.locations)) return false;
  if (!hasRentInRange(text, config.minRent, config.maxRent)) return false;

  return true;
}

/**
 * Pure detector: mails die een langetermijn-huurwoning beschrijven binnen de
 * geconfigureerde prijsklasse en regio. Geen configuratie? Dan niets — zie
 * de toelichting bij HousingCriteria hierboven.
 */
export function detectHousingLongterm(
  emails: EmailCandidate[],
  config: HousingCriteria | null,
): EscalationCandidate[] {
  if (!config) return [];

  return emails
    .filter((e) => isLongTermHousingOpportunity(`${e.subject}\n${e.body_text}`, config))
    .map((e) => ({ trigger: "housing_longterm" as const, ref_id: e.id, message: HOUSING_MESSAGE }));
}
