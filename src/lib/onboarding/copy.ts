import { LEVELS, type MandateLevel } from "@/lib/mandates/domains";
import { RUN_LABELS, type RunKind } from "@/lib/runs/schedule";
import type { TriggerDefinition } from "@/lib/escalation/triggers";

/**
 * Tekst die de wizard nodig heeft om een mandaatniveau en het briefingritme in
 * gewone taal uit te leggen — puur en los van de pagina, zodat het zonder
 * database of sessie te testen is (zelfde afweging als deriveSteps in
 * steps.ts en planEscalations in src/lib/escalation/engine.ts).
 *
 * Belangrijk: niets hier is per domein of per trigger hardgecodeerd. Het
 * mandaatmodel breidt uit (DOMAIN_REGISTRY groeit van 2 naar 9 domeinen — zie
 * src/lib/mandates/domains.ts), en de escalatietriggers kunnen een nieuwe
 * detector krijgen (src/lib/escalation/triggers.ts). Een lijst met "calendar
 * betekent dit, email_send betekent dat" zou bij elke uitbreiding stilzwijgend
 * onvolledig blijven — dus leunt dit bestand alleen op wat al generiek in die
 * registries staat (het niveau zelf, `label`, `enabled`).
 */

/**
 * Wat elk mandaatniveau betekent, ongeacht welk domein het is. De vraag "wat
 * mag Wingman hiermee?" en de naam van de bron staan al op het scherm (de
 * legend-tekst uit DOMAIN_REGISTRY[domain].description); hier hoeft dus geen
 * domeinnaam herhaald te worden.
 */
export const LEVEL_HELP: Record<MandateLevel, string> = {
  1: "Ik zie het en stel voor. Er gebeurt nooit iets zonder dat jij op ja klikt.",
  2: "Ik zet het zelf klaar; het laatste zetje geef jij.",
  3: "Ik doe het zelf en meld achteraf wat ik deed.",
};

// Garandeert dat LEVEL_HELP meegroeit als er ooit een vierde niveau bijkomt
// in plaats van dat de wizard zwijgt over een niveau dat wel op het scherm
// staat. Faalt hard, dus in een test — niet in productie om 3 uur 's nachts.
for (const level of LEVELS) {
  if (!(level in LEVEL_HELP)) throw new Error(`LEVEL_HELP mist uitleg voor niveau ${level}`);
}

export interface RunMoment {
  kind: RunKind;
  at: string;
  enabled: boolean;
}

/**
 * "Ochtend om 08:00, middag om 12:00 en avond om 20:00." — alleen de
 * momenten die aanstaan, in de vaste RUN_KINDS-volgorde. Een uitgezet moment
 * blijft ongenoemd: dat stoort toch niet.
 */
export function ritmeSentence(runs: RunMoment[]): string {
  const aan = runs.filter((r) => r.enabled);
  if (aan.length === 0) {
    return "Alle vaste momenten staan nu uit. Zet ze aan bij Instellingen om het ritme te laten draaien.";
  }
  const delen = aan.map((r) => `${momentNaam(r.kind)} om ${r.at}`);
  return `${joinNatural(delen, "en")}. Een moment zonder nieuws stuurt niets — geen melding voor de vorm.`;
}

function momentNaam(kind: RunKind): string {
  return RUN_LABELS[kind].split(" — ")[0];
}

/**
 * Eén zin met de escalatietriggers die nu echt actief zijn. Vult zichzelf aan
 * zodra triggers.ts een nieuwe detector krijgt (`enabled: true`), zonder dat
 * deze tekst hoeft mee te veranderen.
 */
export function escalationSentence(triggers: TriggerDefinition[]): string {
  const actief = triggers.filter((t) => t.enabled);
  if (actief.length === 0) {
    return "Daarbuiten stoor ik nu nergens voor — er staat geen enkele escalatie aan.";
  }
  const labels = actief.map((t) => lowerFirst(t.label));
  return `Daarbuiten stoor ik alleen bij ${joinNatural(labels, "of")} — maximaal twee keer per dag.`;
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function joinNatural(items: string[], conjunction: string): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * "22:00" + "07:00" → "22:00-07:00", het formaat dat inStilleUren()
 * (src/lib/runs/notify.ts) en de escalatie-engine al lezen. Een leeg of
 * onleesbaar tijdveld levert null op — dan slaat continueOnboarding niets op
 * in plaats van een kapotte waarde weg te schrijven die de planner elke tick
 * laat struikelen.
 */
export function formatQuietHours(van: string, tot: string): string | null {
  if (!TIME.test(van) || !TIME.test(tot)) return null;
  return `${van}-${tot}`;
}

/** Voor de defaultValue van de twee tijdvelden — 22:00–07:00 als er nog niets staat. */
export function parseQuietHours(value: string | null | undefined): { van: string; tot: string } {
  const [van, tot] = (value ?? "").split("-");
  return {
    van: van && TIME.test(van) ? van : "22:00",
    tot: tot && TIME.test(tot) ? tot : "07:00",
  };
}
