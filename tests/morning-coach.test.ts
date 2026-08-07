import { describe, expect, it, vi } from "vitest";
import { heuristicText, parseCoachJson, schrijfCoachTekst } from "@/brain/runs/morning";
import type { LlmCaller, LlmResult } from "@/brain/llm";

/**
 * De coach-tekst-laag van de ochtend-run: LLM-antwoord parsen, de oude
 * heuristiek als fallback, en de aanroep die daartussen kiest. Geen database
 * nodig — zelfde opzet als tests/extract-commitments.test.ts.
 */

describe("parseCoachJson", () => {
  it("accepteert een compleet antwoord", () => {
    const parsed = parseCoachJson({
      frog_title: "Bel Iris terug",
      frog_sub: "Vandaag, 10 minuten.",
      coach_text: "Dit schuift al 16 dagen door.",
    });
    expect(parsed).toEqual({
      frog_title: "Bel Iris terug",
      frog_sub: "Vandaag, 10 minuten.",
      coach_text: "Dit schuift al 16 dagen door.",
    });
  });

  it("geeft null terug bij een ontbrekend of leeg veld", () => {
    expect(parseCoachJson({ frog_title: "x", frog_sub: "y" })).toBeNull(); // coach_text mist
    expect(parseCoachJson({ frog_title: "", frog_sub: "y", coach_text: "z" })).toBeNull();
    expect(parseCoachJson({ frog_title: "x", frog_sub: "   ", coach_text: "z" })).toBeNull();
  });

  it("geeft null terug bij verkeerde types of geen object", () => {
    expect(parseCoachJson({ frog_title: 1, frog_sub: "y", coach_text: "z" })).toBeNull();
    expect(parseCoachJson(null)).toBeNull();
    expect(parseCoachJson("tekst")).toBeNull();
  });
});

describe("heuristicText", () => {
  const now = new Date("2026-08-07T08:00:00Z");
  const frog = {
    what: "Reactie op opzet",
    party: "Iris",
    opened_at: new Date("2026-07-10T08:00:00Z"),
    context: "Vroeg om feedback.",
  };

  it("gebruikt frog.what als titel en vermeldt de wachttijd in frog_sub", () => {
    const tekst = heuristicText(frog, 1, now);
    expect(tekst.frog_title).toBe("Reactie op opzet");
    expect(tekst.frog_sub).toContain("Iris");
    expect(tekst.frog_sub).toContain("dagen");
  });

  it("noemt het patroon bij meer dan drie open items", () => {
    const tekst = heuristicText(frog, 5, now);
    expect(tekst.coach_text).toContain("5 beloftes");
  });

  it("houdt het bij één regel onder de drie open items", () => {
    const tekst = heuristicText(frog, 2, now);
    expect(tekst.coach_text).toBe("Eén ding vandaag: Iris. De rest kan wachten.");
  });
});

const fallback = {
  frog_title: "Reactie op opzet",
  frog_sub: "Iris wacht hier 28 dagen op.",
  coach_text: "Eén ding vandaag: Iris. De rest kan wachten.",
};

function llmOk(json: unknown): LlmCaller {
  return vi.fn().mockResolvedValue({ ok: true, json } satisfies LlmResult);
}

function llmFail(): LlmCaller {
  return vi.fn().mockResolvedValue({ ok: false, reason: "not_configured", message: "geen key" } satisfies LlmResult);
}

describe("schrijfCoachTekst", () => {
  const params = {
    openCommitments: [{ what: "Reactie op opzet", party: "Iris", days: 28, direction: "i_owe" }],
    todayEvents: [{ title: "Overleg", start: "2026-08-07T09:00:00.000Z" }],
    fallback,
  };

  it("gebruikt het modelantwoord bij een geldig resultaat", async () => {
    const llmCall = llmOk({
      frog_title: "Bel Iris terug",
      frog_sub: "Vandaag, 10 minuten — ze wacht al 28 dagen.",
      coach_text: "Dit schuift al 28 dagen door, dat is geen tijdgebrek.",
    });

    const tekst = await schrijfCoachTekst({ ...params, llmCall });

    expect(tekst.frog_title).toBe("Bel Iris terug");
    expect(tekst).not.toEqual(fallback);
  });

  it("valt terug op de heuristiek zonder key (not_configured)", async () => {
    const tekst = await schrijfCoachTekst({ ...params, llmCall: llmFail() });
    expect(tekst).toEqual(fallback);
  });

  it("valt terug op de heuristiek bij een onbruikbaar modelantwoord", async () => {
    const llmCall = llmOk({ frog_title: "alleen dit veld" }); // frog_sub/coach_text ontbreken
    const tekst = await schrijfCoachTekst({ ...params, llmCall });
    expect(tekst).toEqual(fallback);
  });

  it("valt terug op de heuristiek als de aanroep zelf gooit", async () => {
    const llmCall: LlmCaller = vi.fn().mockRejectedValue(new Error("netwerk kapot"));
    const tekst = await schrijfCoachTekst({ ...params, llmCall });
    expect(tekst).toEqual(fallback);
  });

  it("stuurt de open commitments en agenda mee, en roept het coach-model aan", async () => {
    const llmCall = llmOk({ frog_title: "x", frog_sub: "y", coach_text: "z" });

    await schrijfCoachTekst({ ...params, llmCall });

    const call = (llmCall as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-5");
    expect(call.prompt as string).toContain("Reactie op opzet");
    expect(call.prompt as string).toContain("Overleg");
  });
});
