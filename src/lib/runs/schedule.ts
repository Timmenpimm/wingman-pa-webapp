import { localDateKey } from "@/lib/day";

/**
 * Bepaalt of een gepland moment aan de beurt is.
 *
 * Bewust puur: geen database, geen netwerk, geen `new Date()` binnenin. Dit is
 * de plek waar zomertijd en middernacht fout gaan, en dat wil je in een test
 * kunnen naspelen in plaats van om 03:00 in productie ontdekken.
 *
 * De cron die hieraan trekt loopt soms minuten achter. Daarom is "aan de
 * beurt" niet "het is precies 08:00" maar "het is 08:00 geweest en vandaag is
 * dit moment nog niet gedraaid". Een briefing om 08:07 is niet minder waard;
 * twee briefings wel.
 */

export type RunKind = "morning" | "midday" | "evening";

export const RUN_KINDS: RunKind[] = ["morning", "midday", "evening"];

export const RUN_LABELS: Record<RunKind, string> = {
  morning: "Ochtend — de dag klaarzetten",
  midday: "Middag — bijsturen als er iets verschoof",
  evening: "Avond — afsluiten en morgen voorbereiden",
};

/** Wat een nieuwe gebruiker krijgt. Drie momenten, niet meer. */
export const RUN_DEFAULTS: Array<{ kind: RunKind; at: string }> = [
  { kind: "morning", at: "08:00" },
  { kind: "midday", at: "12:00" },
  { kind: "evening", at: "20:00" },
];

export interface ScheduleInput {
  at: string; // "08:00"
  days: number[]; // ISO-weekdagen, maandag = 1
  enabled: boolean;
  last_run_on: string | null;
  timezone: string;
}

export type DueVerdict =
  | { due: true; localDate: string }
  | { due: false; reason: "uitgezet" | "andere dag" | "nog niet" | "al gedraaid" };

export function isDue(run: ScheduleInput, now: Date): DueVerdict {
  if (!run.enabled) return { due: false, reason: "uitgezet" };

  const localDate = localDateKey(run.timezone, now);

  // Al gedraaid vóór de weekdagcheck: goedkoper, en het is de vaakst
  // voorkomende uitkomst — een tick elke 15 minuten betekent 95 keer per dag
  // "die is al geweest".
  if (run.last_run_on === localDate) return { due: false, reason: "al gedraaid" };

  if (!run.days.includes(isoWeekday(run.timezone, now))) {
    return { due: false, reason: "andere dag" };
  }

  if (localMinutes(run.timezone, now) < parseTime(run.at)) {
    return { due: false, reason: "nog niet" };
  }

  return { due: true, localDate };
}

/** Minuten sinds middernacht in de tijdzone van de gebruiker. */
export function localMinutes(timezone: string, at: Date): number {
  const [uur, minuut] = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(at)
    .split(":")
    .map(Number);
  // 24:00 bestaat in sommige locales voor middernacht; terugbrengen naar 0.
  return (uur % 24) * 60 + minuut;
}

/** Maandag = 1, zondag = 7 (ISO-8601). */
export function isoWeekday(timezone: string, at: Date): number {
  const kort = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(at);
  const volgorde = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return volgorde.indexOf(kort) + 1;
}

export function parseTime(at: string): number {
  const [uur, minuut] = at.split(":").map(Number);
  if (!Number.isInteger(uur) || !Number.isInteger(minuut)) {
    throw new Error(`Ongeldig tijdstip: "${at}". Verwacht "HH:MM".`);
  }
  return uur * 60 + minuut;
}

export function isRunKind(waarde: string): waarde is RunKind {
  return RUN_KINDS.includes(waarde as RunKind);
}

export function parseDays(json: string): number[] {
  try {
    const dagen = JSON.parse(json) as unknown;
    if (!Array.isArray(dagen)) return [1, 2, 3, 4, 5, 6, 7];
    const geldig = dagen.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7);
    return geldig.length > 0 ? geldig : [1, 2, 3, 4, 5, 6, 7];
  } catch {
    return [1, 2, 3, 4, 5, 6, 7];
  }
}
