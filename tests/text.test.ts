import { describe, expect, it } from "vitest";
import { BUDGET, clamp, durationPhrase, overBudget } from "@/lib/text";

/**
 * De budgetten zijn productontwerp (§4A): een model houdt zich er niet altijd
 * aan, dus de UI kapt af. Gaat dit stuk, dan lopen kaarten over.
 */
describe("karakterbudgetten", () => {
  it("laat tekst binnen het budget met rust", () => {
    expect(clamp("Verzekeraar bellen", "frogTitle")).toBe("Verzekeraar bellen");
  });

  it("kapt af op woordgrens met een ellipsis", () => {
    const lang = "Dit is een veel te lange frog-titel die absoluut niet past";
    const out = clamp(lang, "frogTitle");
    expect(out.length).toBeLessThanOrEqual(BUDGET.frogTitle);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/); // geen spatie vlak voor de ellipsis
  });

  it("normaliseert witruimte", () => {
    expect(clamp("  twee   spaties  ", "priority")).toBe("twee spaties");
  });

  it("herkent te lange tekst", () => {
    expect(overBudget("x".repeat(BUDGET.coach) + "x", "coach")).toBe(true);
    expect(overBudget("kort", "coach")).toBe(false);
  });
});

describe("duur benoemen zonder te bestraffen", () => {
  const nu = new Date("2026-08-05T12:00:00Z");
  it("telt in hele dagen", () => {
    expect(durationPhrase(new Date("2026-08-05T09:00:00Z"), nu)).toBe("vandaag");
    expect(durationPhrase(new Date("2026-08-04T09:00:00Z"), nu)).toBe("1 dag");
    expect(durationPhrase(new Date("2026-07-10T09:00:00Z"), nu)).toBe("26 dagen");
  });
});
