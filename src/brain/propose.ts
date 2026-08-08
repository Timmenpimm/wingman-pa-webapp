import { zonedTimeToUtc } from "@/lib/day";
import { clamp } from "@/lib/text";

/**
 * De voorstelmotor — het eerste stuk van Wingman dat uit zichzelf iets wil.
 *
 * Tot nu toe kwam elke tool-aanroep van een knop of een REST-verzoek: de app
 * kón handelen, maar bedacht nooit dat het moest. Daardoor stond het hele
 * mandaatmodel droog — niveau 2 en 3 bestaan alleen als er iets is om over te
 * beslissen, en de vertrouwensloop kan pas promoveren als er iets te tellen
 * valt. Dit bestand levert die voorstellen.
 *
 * Drie regels bepalen de vorm:
 *
 * 1. **Puur.** Geen database, geen netwerk, geen LLM. Invoer is de stand van
 *    vandaag, uitvoer is een lijstje bedoelingen. De runner
 *    (src/lib/runs/propose.ts) duwt ze door `requestTool()` en dus door de
 *    permissiepoort — deze module beslist nooit zelf of iets mag.
 *
 * 2. **Geen LLM.** Elke voorgestelde tekst komt uit de data zelf. Dat is geen
 *    tijdelijke oplossing: een voorstel dat pas verschijnt als er een API-key
 *    staat, is een motor die je niet kunt aanzetten. Het model mag later de
 *    formulering verbeteren; het mag nooit bepalen dát er iets voorgesteld
 *    wordt.
 *
 * 3. **Deduplicatie is verplicht.** De planner draait elke vijftien minuten.
 *    Elk voorstel draagt een `dedupeKey`; is die vandaag al gebruikt, dan komt
 *    het voorstel er niet nog eens. Zonder die regel is één agendablok
 *    zesennegentig vragen per dag.
 *
 * Wat het (nog) niet doet: mail beantwoorden inhoudelijk. Het concept dat hier
 * ontstaat is een houdbericht met de feiten die Wingman zeker weet — wie wacht
 * waarop en hoe lang. Dat is precies wat een concept moet zijn: een begin dat
 * je afmaakt, niet een antwoord dat namens jou klaarstaat.
 */

/** Hoeveel voorstellen Wingman op één lokale dag mag doen. */
export const MAX_PROPOSALS_PER_DAY = 3;

/** Werkuren waarbinnen een frog-blok mag landen (lokale klok). */
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 18;

/** Lengte van het frog-blok, in minuten. Eén frog, één blok, geen halve dag. */
export const FROG_BLOCK_MINUTES = 45;

export interface Proposal {
  tool: string;
  params: Record<string, unknown>;
  /** Uniek per gebruiker; twee keer dezelfde sleutel = één voorstel. */
  dedupeKey: string;
}

export interface ProposalInput {
  /** yyyy-mm-dd zoals de gebruiker het op zijn klok ziet. */
  localDate: string;
  timezone: string;
  now: Date;
  /** De briefing van vandaag, als die er al is. Zonder briefing geen frog-blok. */
  frog: { title: string; status: string } | null;
  /** Alles wat vandaag al in de agenda staat. */
  events: Array<{ title: string; start_at: Date; end_at: Date | null }>;
  /** Open beloftes waar de gebruiker aan zet is, oudste eerst. */
  commitments: Array<{
    id: string;
    what: string;
    party: string;
    party_contact: string | null;
    source: string;
    opened_at: Date;
  }>;
  /** Sleutels die vandaag al voorgesteld zijn. */
  usedDedupeKeys: ReadonlySet<string>;
  /** Hoeveel voorstellen er vandaag al gedaan zijn. */
  proposalsToday: number;
}

export function planProposals(input: ProposalInput): Proposal[] {
  const ruimte = MAX_PROPOSALS_PER_DAY - input.proposalsToday;
  if (ruimte <= 0) return [];

  // Volgorde is de prioriteit: het agendablok eerst. Een frog zonder tijd is
  // de reden dat hij morgen weer de frog is; een concept-mail is nuttig maar
  // nooit urgenter dan dat.
  const alles = [...planFrogBlock(input), ...planReplyDrafts(input)];

  const uit: Proposal[] = [];
  const gezien = new Set(input.usedDedupeKeys);
  for (const voorstel of alles) {
    if (uit.length >= ruimte) break;
    if (gezien.has(voorstel.dedupeKey)) continue;
    gezien.add(voorstel.dedupeKey);
    uit.push(voorstel);
  }
  return uit;
}

/* ---------- Het frog-blok ------------------------------------------------ */

/**
 * Zet tijd opzij voor de frog, als die er is, nog open staat, en er nog geen
 * blok voor bestaat.
 *
 * "Bestaat al" wordt op de titel herkend en niet op een id, omdat de gebruiker
 * het blok ook zelf gemaakt kan hebben — in Fantastical, op zijn telefoon, met
 * de hand. Een voorstel voor iets dat er al staat is erger dan geen voorstel.
 */
function planFrogBlock(input: ProposalInput): Proposal[] {
  const frog = input.frog;
  if (!frog || frog.status !== "open") return [];
  if (heeftBlokVoor(frog.title, input.events)) return [];

  const slot = eersteVrijeSlot(input);
  if (!slot) return [];

  return [
    {
      tool: "calendar.create_event",
      params: {
        title: clamp(frog.title, "frogTitle"),
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        description: "Blok van Wingman voor je frog van vandaag.",
      },
      dedupeKey: `frog-block:${input.localDate}`,
    },
  ];
}

/**
 * Herkent een bestaand blok voor deze frog. Vergelijkt op genormaliseerde
 * woorden in plaats van op de hele string: "Schuldhulp Ede bellen" en
 * "bellen schuldhulp ede" zijn hetzelfde blok, en een LLM dat de titel iets
 * anders formuleert mag geen tweede blok opleveren.
 */
export function heeftBlokVoor(
  frogTitle: string,
  events: ProposalInput["events"],
): boolean {
  const woorden = betekenisvolleWoorden(frogTitle);
  if (woorden.length === 0) return false;
  return events.some((e) => {
    const inTitel = new Set(betekenisvolleWoorden(e.title));
    const overlap = woorden.filter((w) => inTitel.has(w)).length;
    return overlap / woorden.length >= 0.6;
  });
}

function betekenisvolleWoorden(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

/**
 * Het eerste gat van FROG_BLOCK_MINUTES binnen werkuren, vanaf nu.
 *
 * Loopt de dag langs in stappen van een kwartier en pakt het eerste kwartier
 * waarop het hele blok vrij is. Geen zoektocht naar de "beste" tijd: die
 * afweging kent de gebruiker beter dan wij, en een voorstel dat je verschuift
 * is nog steeds een voorstel dat werkte.
 */
export function eersteVrijeSlot(
  input: Pick<ProposalInput, "localDate" | "timezone" | "now" | "events">,
): { start: Date; end: Date } | null {
  const dagStart = zonedTimeToUtc(input.localDate, input.timezone, WORK_START_HOUR);
  const dagEind = zonedTimeToUtc(input.localDate, input.timezone, WORK_END_HOUR);
  const duur = FROG_BLOCK_MINUTES * 60_000;

  // Nooit in het verleden voorstellen: een blok van tien uur vanochtend is om
  // drie uur 's middags geen aanbod maar een verwijt.
  const vanaf = new Date(Math.max(dagStart.getTime(), afgerondOpKwartier(input.now).getTime()));

  for (let t = vanaf.getTime(); t + duur <= dagEind.getTime(); t += 15 * 60_000) {
    const start = new Date(t);
    const eind = new Date(t + duur);
    if (!overlapt(start, eind, input.events)) return { start, end: eind };
  }
  return null;
}

function afgerondOpKwartier(at: Date): Date {
  const kwartier = 15 * 60_000;
  return new Date(Math.ceil(at.getTime() / kwartier) * kwartier);
}

function overlapt(start: Date, eind: Date, events: ProposalInput["events"]): boolean {
  return events.some((e) => {
    // Een afspraak zonder einde telt als een uur: onbekend is niet leeg, en
    // een blok bovenop een lopende afspraak zetten is de ene fout die je niet
    // meer terugdraait.
    const eEind = e.end_at ?? new Date(e.start_at.getTime() + 3_600_000);
    return e.start_at < eind && eEind > start;
  });
}

/* ---------- Het concept-antwoord ----------------------------------------- */

/**
 * Zet een concept klaar voor de oudste belofte die per mail binnenkwam en waar
 * een adres bij hoort.
 *
 * Alleen `source: "email"`: een belofte die uit de agenda of uit capture komt
 * heeft geen thread om op te antwoorden, en een losse mail sturen naar iemand
 * die je niet gemaild hebt is geen concept maar een verrassing.
 */
function planReplyDrafts(input: ProposalInput): Proposal[] {
  const kandidaat = input.commitments.find(
    (c) => c.source === "email" && isEmail(c.party_contact),
  );
  if (!kandidaat) return [];

  return [
    {
      tool: "gmail.draft_reply",
      params: {
        to: kandidaat.party_contact,
        subject: clamp(`Re: ${kandidaat.what}`, "draftSubject"),
        body: conceptTekst(kandidaat),
      },
      dedupeKey: `reply-draft:${kandidaat.id}`,
    },
  ];
}

function isEmail(value: string | null): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * De tekst van het concept: een openingszin en verder ruimte.
 *
 * Bewust minimaal. Alles wat Wingman hier extra invult, is iets wat de
 * gebruiker niet gezegd heeft — een excuus dat hij niet aanbood, een termijn
 * die hij niet toezegde. Hoe lang iets al ligt staat in de samenvatting die
 * híj ziet, niet in de mail die de ander leest: dat is zijn informatie, niet
 * die van de ontvanger.
 *
 * Ook geen aanhef met naam: `party` is soms een bedrijf en soms een adres, en
 * "Beste noreply@" maakt een concept in één regel onbruikbaar.
 *
 * `clamp` gaat over `what` en niet over het geheel: die functie plet witruimte
 * en zou de alinea's tot één regel maken.
 */
export function conceptTekst(commitment: { what: string }): string {
  return [
    "Hoi,",
    "",
    `Over ${clamp(commitment.what, "looseEndTitle")} — daar kom ik nu op terug.`,
    "",
    "",
    "Met vriendelijke groet,",
  ].join("\n");
}
