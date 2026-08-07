import type { Provider } from "@/lib/types";
import type { Domain } from "@/lib/mandates/domains";

/**
 * De staat van de onboarding (§6.3).
 *
 * Eén bron per scherm, en de vraag "wat mag ik hiermee?" staat in dezelfde
 * stap als de koppeling. Dat is het hele idee: direct nadat iemand ziet wát ik
 * in zijn agenda vind, is het enige moment waarop die vraag ergens over gaat.
 * Een aparte permissiestap achteraan is bureaucratie en wordt weggeklikt.
 *
 * De voortgang wordt nergens apart bijgehouden als stapnummer. Hij volgt uit
 * wat er ís: een Connector-rij, of een markering in UserSetting dat iemand de
 * stap bewust heeft overgeslagen of met de hand heeft afgevinkt. Een teller
 * zou kunnen ontsporen ten opzichte van de werkelijkheid — dit niet, en
 * hervatten na afhaken werkt er gratis mee.
 */

export type StepId = "agenda" | "mail" | "bank" | "meldingen";

/** "done" = met de hand afgevinkt (meldingen), "skipped" = bewust overgeslagen. */
export type StepMark = "done" | "skipped";

export interface StepDefinition {
  id: StepId;
  /** Kop op het scherm zelf. */
  title: string;
  /** Naam in het spoor bovenaan — kort, past naast drie andere. */
  short: string;
  /** Welke connectors deze stap afronden. Leeg = geen bron (meldingen). */
  providers: Provider[];
  /**
   * Welk(e) domein(en) (src/lib/mandates/domains.ts) deze stap bevraagt. Leeg
   * = geen mandaatvraag (bank, meldingen) — de bank is alleen-lezen (§6.7), en
   * een keuzemenu dat toch niets mag doen belooft iets dat niet bestaat.
   */
  domains: Domain[];
  /** Vraagt deze stap om een mandaatniveau? Leeg `domains` betekent hier nee. */
  asksPermission: boolean;
}

export const STEPS: StepDefinition[] = [
  {
    id: "agenda",
    title: "Agenda koppelen",
    short: "Agenda",
    providers: ["google", "caldav"],
    domains: ["calendar"],
    asksPermission: true,
  },
  {
    id: "mail",
    title: "Mail koppelen",
    short: "Mail",
    providers: ["gmail", "imap"],
    domains: ["email_send"],
    asksPermission: true,
  },
  {
    id: "bank",
    title: "Bank koppelen",
    short: "Bank",
    providers: ["ponto"],
    domains: [],
    asksPermission: false,
  },
  {
    id: "meldingen",
    title: "App installeren en meldingen aanzetten",
    short: "Meldingen",
    providers: [],
    domains: [],
    asksPermission: false,
  },
];

export const STEP_IDS: StepId[] = STEPS.map((s) => s.id);

export function isStepId(value: string | undefined): value is StepId {
  return typeof value === "string" && STEP_IDS.includes(value as StepId);
}

export function stepDefinition(id: StepId): StepDefinition {
  // STEPS is de bron; isStepId() garandeert dat dit bestaat.
  return STEPS.find((s) => s.id === id)!;
}

export type StepStatus = "connected" | "confirmed" | "skipped" | "todo";

export interface StepState {
  id: StepId;
  /** 1-gebaseerd, voor "stap 2 van 4". */
  number: number;
  title: string;
  short: string;
  status: StepStatus;
  /** Klaar genoeg om door te lopen — gekoppeld, afgevinkt of overgeslagen. */
  done: boolean;
}

export interface ConnectorFacts {
  provider: string;
  status: string;
}

/**
 * Wat er nog open staat, puur uit gegevens afgeleid. Geen database, geen
 * sessie — daarom te testen zonder er een van beide bij te halen.
 *
 * Een connector in `error` of `reauth_required` telt hier als gekoppeld. De
 * koppeling zelf is gelegd; dat hij stukliep is een storing die de briefing
 * zelf meldt (regel 2), geen reden om iemand opnieuw door de onboarding te
 * sturen.
 */
export function deriveSteps(input: {
  connectors: ConnectorFacts[];
  marks: Partial<Record<StepId, StepMark>>;
}): StepState[] {
  return STEPS.map((step, index) => {
    const connected = input.connectors.some(
      (c) => step.providers.includes(c.provider as Provider) && c.status !== "not_connected",
    );
    const mark = input.marks[step.id];

    const status: StepStatus = connected
      ? "connected"
      : mark === "done"
        ? "confirmed"
        : mark === "skipped"
          ? "skipped"
          : "todo";

    return {
      id: step.id,
      number: index + 1,
      title: step.title,
      short: step.short,
      status,
      done: status !== "todo",
    };
  });
}

/**
 * Is deze gebruiker de onboarding ooit begonnen?
 *
 * Eén gekoppelde bron is genoeg, en een bewust overgeslagen stap ook: allebei
 * betekenen dat er een keuze gemaakt is. Alleen wie nog nérgens iets van vindt,
 * hoort de wizard voor zijn neus te krijgen in plaats van zes lege schermen —
 * zie src/lib/onboarding/gate.ts.
 *
 * Bewust niet "is de onboarding áf": iemand die de bank overslaat en verder
 * werkt, mag niet elke keer teruggeduwd worden naar een stap die hij al met
 * opzet heeft laten liggen.
 */
export function hasStartedOnboarding(steps: StepState[], finishedAt: Date | null): boolean {
  return finishedAt !== null || steps.some((s) => s.done);
}

/** De eerste stap die nog aandacht vraagt, of null als alles langs is geweest. */
export function firstOpenStep(steps: StepState[]): StepId | null {
  return steps.find((s) => !s.done)?.id ?? null;
}

/** De stap ná deze — waar "Volgende" heen gaat. Null betekent: naar het slot. */
export function nextStep(current: StepId): StepId | null {
  const index = STEP_IDS.indexOf(current);
  return STEP_IDS[index + 1] ?? null;
}

/**
 * De voorzichtigste stand van een stap: het laagste mandaatniveau dat al
 * ingesteld is voor de domeinen van die stap, of niveau 1 als er nog geen
 * mandaat bestaat. Vóór het mandaatmodel deed `mostRestrictive` dit over de
 * vier oude permissienamen, voor het geval één stap meer dan één connector
 * bevat (een werk- én een privéagenda, elk met een eigen stand). Hetzelfde
 * principe geldt nu over domeinen in plaats van connectors: de wizard stelt de
 * vraag één keer voor de hele stap, en de voorselectie mag nooit ruimer zijn
 * dan wat er al stond. De implementatie zelf staat in
 * src/lib/mandates/domains.ts — hier alleen de re-export zodat de
 * onboarding-laag niet los van `steps.ts` naar `mandates/domains.ts` hoeft te
 * grijpen voor iets dat conceptueel bij deze stappen hoort.
 */
export { mostRestrictiveLevel } from "@/lib/mandates/domains";

/** UserSetting-sleutel voor de markering van één stap. */
export function markKey(id: StepId): string {
  return `onboarding:${id}`;
}

/** UserSetting-sleutel voor het moment waarop iemand de onboarding uitliep. */
export const FINISHED_KEY = "onboarding:klaar_op";

/** Leest de markeringen uit losse UserSetting-rijen. */
export function marksFromSettings(
  settings: Array<{ key: string; value: string }>,
): Partial<Record<StepId, StepMark>> {
  const marks: Partial<Record<StepId, StepMark>> = {};
  for (const id of STEP_IDS) {
    const value = settings.find((s) => s.key === markKey(id))?.value;
    if (value === "done" || value === "skipped") marks[id] = value;
  }
  return marks;
}

/** Pad naar een stap. Op één plek, zodat een hernoeming niet door de app lekt. */
export function stepPath(id: StepId): string {
  return `/onboarding/${id}`;
}

export const FINISH_PATH = "/onboarding/klaar";
