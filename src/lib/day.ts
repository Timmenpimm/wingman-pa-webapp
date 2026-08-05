/**
 * "Vandaag" bestaat alleen in een tijdzone.
 *
 * De server draait op UTC, de gebruiker leeft in Europe/Amsterdam. Wie
 * `new Date()` op de server afkapt op middernacht, krijgt tussen 00:00 en
 * 02:00 lokale tijd de briefing van gisteren — en in de zomer schuift dat mee
 * met de zomertijd. Elke dagberekening loopt daarom via deze functies, met de
 * tijdzone van de gebruiker als invoer.
 *
 * `DailyBriefing.date` slaat een kalenderdatum op, geen moment: de lokale dag
 * van de gebruiker, vastgelegd als middernacht UTC. Zo is de datum stabiel,
 * ongeacht waar de server staat of hoe de klok verzet wordt.
 */

/** yyyy-mm-dd zoals de gebruiker het op zijn klok ziet. */
export function localDateKey(timezone: string, at: Date = new Date()): string {
  // en-CA geeft precies yyyy-mm-dd, zonder handmatig plakken van onderdelen.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** De kalenderdag als sleutel voor de database (middernacht UTC). */
export function dateKeyToUtc(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function localDayStart(timezone: string, at: Date = new Date()): Date {
  return dateKeyToUtc(localDateKey(timezone, at));
}

/**
 * Het echte tijdvenster van de lokale dag, in UTC — voor het ophalen van
 * agendablokken. Dit is iets anders dan de datumsleutel hierboven: 5 augustus
 * in Amsterdam loopt van 4 augustus 22:00 UTC tot 5 augustus 22:00 UTC.
 */
export function localDayRange(
  timezone: string,
  at: Date = new Date(),
): { start: Date; end: Date } {
  const key = localDateKey(timezone, at);
  const start = zonedMidnightToUtc(key, timezone);
  const nextKey = localDateKey(timezone, new Date(start.getTime() + 36 * 3_600_000));
  const end = zonedMidnightToUtc(nextKey, timezone);
  return { start, end };
}

/**
 * Middernacht van een kalenderdag ín een tijdzone, uitgedrukt in UTC.
 * De offset wordt uit de zone zelf afgelezen, dus zomer- en wintertijd komen
 * er vanzelf goed uit — geen hardgecodeerde +1 of +2.
 */
function zonedMidnightToUtc(dateKey: string, timezone: string): Date {
  const naive = dateKeyToUtc(dateKey);
  const offset = zoneOffsetMs(naive, timezone);
  const guess = new Date(naive.getTime() - offset);
  // Eén correctieronde vangt de dag waarop de klok verzet wordt.
  return new Date(naive.getTime() - zoneOffsetMs(guess, timezone));
}

function zoneOffsetMs(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - at.getTime();
}
