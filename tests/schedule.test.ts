import { describe, expect, it } from "vitest";
import { isDue, isoWeekday, localMinutes, parseDays, parseTime } from "@/lib/runs/schedule";

/**
 * De cron tikt elke vijftien minuten. Elke fout hier is dus of "je krijgt niets"
 * of "je krijgt het drie keer" — en dat tweede is precies wat een assistent
 * onbruikbaar maakt.
 */

const TZ = "Europe/Amsterdam";
const basis = {
  at: "08:00",
  days: [1, 2, 3, 4, 5, 6, 7],
  enabled: true,
  last_run_on: null,
  timezone: TZ,
};

describe("is dit moment aan de beurt", () => {
  it("nog niet vóór het tijdstip", () => {
    // 05:30 UTC = 07:30 in Amsterdam (zomertijd)
    const v = isDue(basis, new Date("2026-08-06T05:30:00Z"));
    expect(v).toEqual({ due: false, reason: "nog niet" });
  });

  it("wel zodra het tijdstip geweest is", () => {
    // 06:05 UTC = 08:05 in Amsterdam
    expect(isDue(basis, new Date("2026-08-06T06:05:00Z"))).toEqual({
      due: true,
      localDate: "2026-08-06",
    });
  });

  it("blijft aan de beurt als de cron te laat is", () => {
    // Een briefing om 08:47 is niet minder waard dan om 08:00.
    expect(isDue(basis, new Date("2026-08-06T06:47:00Z")).due).toBe(true);
  });

  it("niet nog een keer op dezelfde dag", () => {
    const v = isDue({ ...basis, last_run_on: "2026-08-06" }, new Date("2026-08-06T09:00:00Z"));
    expect(v).toEqual({ due: false, reason: "al gedraaid" });
  });

  it("wel weer de volgende dag", () => {
    expect(
      isDue({ ...basis, last_run_on: "2026-08-05" }, new Date("2026-08-06T06:05:00Z")).due,
    ).toBe(true);
  });

  it("niet als hij uitstaat", () => {
    expect(isDue({ ...basis, enabled: false }, new Date("2026-08-06T09:00:00Z"))).toEqual({
      due: false,
      reason: "uitgezet",
    });
  });

  it("niet op een dag die niet gekozen is", () => {
    // 6 augustus 2026 is een donderdag (4).
    const v = isDue({ ...basis, days: [6, 7] }, new Date("2026-08-06T06:05:00Z"));
    expect(v).toEqual({ due: false, reason: "andere dag" });
  });
});

describe("zomer- en wintertijd", () => {
  it("gebruikt +2 in de zomer", () => {
    // 06:00 UTC = 08:00 lokaal → precies op tijd.
    expect(isDue(basis, new Date("2026-08-06T06:00:00Z")).due).toBe(true);
    expect(isDue(basis, new Date("2026-08-06T05:59:00Z")).due).toBe(false);
  });

  it("gebruikt +1 in de winter", () => {
    // 07:00 UTC = 08:00 lokaal in januari.
    expect(isDue(basis, new Date("2026-01-15T07:00:00Z")).due).toBe(true);
    expect(isDue(basis, new Date("2026-01-15T06:59:00Z")).due).toBe(false);
  });

  it("schuift mee op de dag dat de klok vooruit gaat", () => {
    // Laatste zondag van maart 2026: 29 maart, klok van 02:00 naar 03:00.
    // 06:00 UTC is die dag 08:00 lokaal, net als in de rest van de zomer.
    expect(localMinutes(TZ, new Date("2026-03-29T06:00:00Z"))).toBe(8 * 60);
    // De dag ervoor was 06:00 UTC nog 07:00 lokaal.
    expect(localMinutes(TZ, new Date("2026-03-28T06:00:00Z"))).toBe(7 * 60);
  });

  it("telt weekdagen in de lokale tijdzone, niet in UTC", () => {
    // 22:30 UTC op donderdag is in Amsterdam al vrijdag.
    expect(isoWeekday(TZ, new Date("2026-08-06T22:30:00Z"))).toBe(5);
    expect(isoWeekday(TZ, new Date("2026-08-06T12:00:00Z"))).toBe(4);
  });
});

describe("invoer die niet klopt", () => {
  it("leest een tijdstip", () => {
    expect(parseTime("08:00")).toBe(480);
    expect(parseTime("20:30")).toBe(1230);
    expect(() => parseTime("acht uur")).toThrow(/Ongeldig tijdstip/);
  });

  it("valt terug op alle dagen bij onzin", () => {
    expect(parseDays("[1,2,3]")).toEqual([1, 2, 3]);
    expect(parseDays("kapot")).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(parseDays("[]")).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(parseDays("[0,9]")).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("stille uren", () => {
  it("houdt een bericht tegen binnen het venster over middernacht", async () => {
    const { inStilleUren } = await import("@/lib/runs/notify");
    // 22:00-07:00, dus 23:30 lokaal ligt binnen het venster.
    expect(inStilleUren("22:00-07:00", TZ, new Date("2026-08-06T21:30:00Z"))).toBe(true);
    // 06:30 lokaal ook.
    expect(inStilleUren("22:00-07:00", TZ, new Date("2026-08-06T04:30:00Z"))).toBe(true);
    // 12:00 lokaal niet.
    expect(inStilleUren("22:00-07:00", TZ, new Date("2026-08-06T10:00:00Z"))).toBe(false);
  });

  it("werkt ook met een venster binnen één dag", async () => {
    const { inStilleUren } = await import("@/lib/runs/notify");
    expect(inStilleUren("13:00-14:00", TZ, new Date("2026-08-06T11:30:00Z"))).toBe(true);
    expect(inStilleUren("13:00-14:00", TZ, new Date("2026-08-06T12:30:00Z"))).toBe(false);
  });

  it("laat alles door als er geen venster is ingesteld", async () => {
    const { inStilleUren } = await import("@/lib/runs/notify");
    expect(inStilleUren(undefined, TZ, new Date())).toBe(false);
    expect(inStilleUren("kapot", TZ, new Date())).toBe(false);
  });
});
