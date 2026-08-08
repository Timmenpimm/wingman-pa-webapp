import { describe, expect, it } from "vitest";
import {
  domainLevelText,
  EMPTY_WEEK_STATS,
  parseNotify,
  suggestionText,
  toolDomain,
  totalStats,
  weeklyStatsByDomain,
} from "@/app/(app)/wat-mag-wingman/stats";
import { DOMAINS, LEVELS } from "@/lib/mandates/domains";

/**
 * De pure kern achter "Wat mag Wingman" (fase 2, punt 3 van de roadmap):
 * echte aantallen uit het ToolCall-logboek, per domein, en de tekst die
 * uitlegt wat een niveau betekent — zonder database, zoals
 * tests/mandate-suggestions.test.ts en tests/tools.test.ts dat ook doen voor
 * hun eigen pure kern.
 */

describe("toolDomain", () => {
  it("kent bestaande tools aan hun domein toe", () => {
    expect(toolDomain("gmail.draft_reply")).toBe("email_send");
    expect(toolDomain("calendar.create_event")).toBe("calendar");
    expect(toolDomain("calendar.list_day")).toBe("calendar");
  });

  it("geeft undefined voor een onbekende tool, geen worp", () => {
    expect(toolDomain("iets.dat_niet_bestaat")).toBeUndefined();
  });
});

describe("weeklyStatsByDomain", () => {
  it("telt de vier bekende statussen per domein, geen andere", () => {
    const stats = weeklyStatsByDomain([
      { tool: "gmail.draft_reply", status: "done" },
      { tool: "gmail.draft_reply", status: "pending" },
      { tool: "gmail.draft_reply", status: "rejected" },
      { tool: "calendar.create_event", status: "failed" },
      { tool: "calendar.create_event", status: "done" },
      // "running" is een voorbijgaande staat en telt nergens voor mee.
      { tool: "calendar.list_day", status: "running" },
    ]);

    expect(stats.get("email_send")).toEqual({ gedaan: 1, klaargezet: 1, afgewezen: 1, mislukt: 0 });
    expect(stats.get("calendar")).toEqual({ gedaan: 1, klaargezet: 0, afgewezen: 0, mislukt: 1 });
  });

  it("een lege lijst levert een lege kaart op — geen verzonnen cijfers", () => {
    const stats = weeklyStatsByDomain([]);
    expect(stats.size).toBe(0);
  });

  it("een onbekende tool telt niet mee en laat de rest ongemoeid", () => {
    const stats = weeklyStatsByDomain([
      { tool: "iets.dat_niet_bestaat", status: "done" },
      { tool: "gmail.draft_reply", status: "done" },
    ]);
    expect(stats.get("email_send")).toEqual({ gedaan: 1, klaargezet: 0, afgewezen: 0, mislukt: 0 });
    expect(stats.size).toBe(1);
  });
});

describe("totalStats", () => {
  it("is nul voor een lege kaart", () => {
    expect(totalStats(EMPTY_WEEK_STATS)).toBe(0);
  });

  it("telt de vier categorieën op", () => {
    expect(totalStats({ gedaan: 2, klaargezet: 1, afgewezen: 0, mislukt: 1 })).toBe(4);
  });
});

describe("domainLevelText en LEVEL_UITLEG", () => {
  it("heeft voor elk geregistreerd domein en elk niveau een niet-lege tekst", () => {
    for (const domain of DOMAINS) {
      for (const level of LEVELS) {
        const tekst = domainLevelText(domain, level);
        expect(tekst.length).toBeGreaterThan(0);
      }
    }
  });

  it("niveau 1 en 2 vragen eerst iets aan jou, niveau 3 vraagt niets", () => {
    for (const domain of DOMAINS) {
      expect(domainLevelText(domain, 1)).toContain("vraagt hij eerst iets aan jou");
      expect(domainLevelText(domain, 2)).toContain("vraagt hij eerst iets aan jou");
      expect(domainLevelText(domain, 3)).not.toContain("vraagt");
    }
  });
});

describe("suggestionText", () => {
  it("zet dagen om naar weken en gebruikt enkelvoud/meervoud correct", () => {
    const tekst = suggestionText("calendar", { dagen: 28, calls: 1 }, 3);
    expect(tekst).toContain("4 weken");
    expect(tekst).toContain("1 actie");
    expect(tekst).not.toContain("1 acties");
  });

  it("gebruikt enkelvoud 'week' bij precies 7 dagen", () => {
    const tekst = suggestionText("calendar", { dagen: 7, calls: 5 }, 3);
    expect(tekst).toContain("1 week ");
  });
});

describe("parseNotify", () => {
  it("leest de melden/stil-voorkeur uit Mandate.rules", () => {
    expect(parseNotify('{"notify":"stil"}')).toBe("stil");
    expect(parseNotify('{"notify":"melden"}')).toBe("melden");
  });

  it("is defensief bij lege, kapotte of onbekende invoer", () => {
    expect(parseNotify(null)).toBeUndefined();
    expect(parseNotify(undefined)).toBeUndefined();
    expect(parseNotify("{niet-json")).toBeUndefined();
    expect(parseNotify('{"notify":42}')).toBeUndefined();
  });
});
