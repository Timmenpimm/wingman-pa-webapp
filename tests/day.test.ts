import { describe, expect, it } from "vitest";
import { localDateKey, localDayRange, localDayStart } from "@/lib/day";

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
