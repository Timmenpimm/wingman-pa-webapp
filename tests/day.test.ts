import { describe, expect, it } from "vitest";
import { localDateKey, localDayRange, localDayStart, localIsoWeekKey } from "@/lib/day";

/**
 * Deze fout stond echt in productie: de server draait op UTC, de gebruiker in
 * Amsterdam. "Vandaag" was daardoor niet dezelfde dag, en de app toonde geen
 * briefing. Deze test is er zodat dat niet stilletjes terugkomt.
 */
const TZ = "Europe/Amsterdam";

describe("dagbepaling in de tijdzone van de gebruiker", () => {
  it("rekent 22:30 UTC in de zomer al tot de volgende dag", () => {
    // 5 aug 22:30 UTC = 6 aug 00:30 in Amsterdam
    expect(localDateKey(TZ, new Date("2026-08-05T22:30:00Z"))).toBe("2026-08-06");
  });

  it("houdt 21:30 UTC in de zomer nog bij dezelfde dag", () => {
    expect(localDateKey(TZ, new Date("2026-08-05T21:30:00Z"))).toBe("2026-08-05");
  });

  it("gebruikt zomertijd (+2) voor het dagvenster", () => {
    const { start, end } = localDayRange(TZ, new Date("2026-08-05T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-08-04T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-05T22:00:00.000Z");
  });

  it("gebruikt wintertijd (+1) voor het dagvenster", () => {
    const { start, end } = localDayRange(TZ, new Date("2026-01-15T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("legt de datumsleutel vast als middernacht UTC", () => {
    expect(localDayStart(TZ, new Date("2026-08-05T12:00:00Z")).toISOString()).toBe(
      "2026-08-05T00:00:00.000Z",
    );
  });
});

describe("localIsoWeekKey — het weekmoment van de vertrouwensloop", () => {
  it("geeft de ISO-weeksleutel van vandaag", () => {
    // 7 augustus 2026 is een vrijdag in ISO-week 32.
    expect(localIsoWeekKey(TZ, new Date("2026-08-07T10:00:00Z"))).toBe("2026-W32");
  });

  it("blijft dezelfde week over de hele maandag-tot-zondag heen", () => {
    // Maandag 3 augustus t/m zondag 9 augustus 2026 is allemaal week 32.
    expect(localIsoWeekKey(TZ, new Date("2026-08-03T06:00:00Z"))).toBe("2026-W32");
    // 19:00 UTC + zomertijd (+2) = 21:00 lokaal op 9 augustus — nog net zondag.
    expect(localIsoWeekKey(TZ, new Date("2026-08-09T19:00:00Z"))).toBe("2026-W32");
  });

  it("springt naar de volgende week zodra de lokale dag maandag wordt", () => {
    // 9 aug 22:30 UTC = 10 aug 00:30 in Amsterdam (zomertijd) — al maandag,
    // dus al week 33, ook al staat de UTC-tijdstempel nog op zondag.
    expect(localIsoWeekKey(TZ, new Date("2026-08-09T22:30:00Z"))).toBe("2026-W33");
  });

  it("rekent de jaarwisseling volgens ISO, niet volgens de kalendermaand", () => {
    // 1 januari 2026 is een donderdag en hoort dus nog bij ISO-week 1 van 2026.
    expect(localIsoWeekKey(TZ, new Date("2026-01-01T10:00:00Z"))).toBe("2026-W01");
    // 31 december 2029 is een maandag en hoort al bij ISO-week 1 van 2030.
    expect(localIsoWeekKey(TZ, new Date("2029-12-31T10:00:00Z"))).toBe("2030-W01");
  });
});
