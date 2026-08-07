import { describe, expect, it } from "vitest";
import { evaluateMandateSuggestion, type SuggestionCandidateInput } from "@/lib/mandates/suggest";

/**
 * De beslisregel achter het promotievoorstel (opdracht §1): 28 dagen op
 * niveau 2, minstens 5 uitgevoerde toolcalls, geen enkele afgewezen, en nooit
 * een tweede voorstel zolang er al één bestaat met to_level 3.
 *
 * Zelfde opzet als tests/escalation-engine.test.ts: alleen de pure kern, geen
 * database — `now` en `mandateSince` gaan als argument mee.
 */

const NOW = new Date("2026-08-07T10:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

const basis: SuggestionCandidateInput = {
  now: NOW,
  mandateLevel: 2,
  mandateSince: daysAgo(28),
  doneCallCount: 5,
  rejectedCallCount: 0,
  alreadyHasLevel3Suggestion: false,
};

describe("evaluateMandateSuggestion — de kernregel", () => {
  it("stelt voor bij precies 28 dagen, 5 calls, 0 rejected", () => {
    const verdict = evaluateMandateSuggestion(basis);
    expect(verdict.propose).toBe(true);
    expect(verdict.evidence).toEqual({ dagen: 28, calls: 5, rejected: 0 });
  });

  it("stelt ook voor bij ruim meer dagen en calls dan het minimum", () => {
    const verdict = evaluateMandateSuggestion({
      ...basis,
      mandateSince: daysAgo(90),
      doneCallCount: 40,
    });
    expect(verdict.propose).toBe(true);
    expect(verdict.evidence).toEqual({ dagen: 90, calls: 40, rejected: 0 });
  });
});

describe("evaluateMandateSuggestion — 28 dagen", () => {
  it("stelt niet voor bij 27 dagen", () => {
    const verdict = evaluateMandateSuggestion({ ...basis, mandateSince: daysAgo(27) });
    expect(verdict.propose).toBe(false);
    expect(verdict.evidence.dagen).toBe(27);
  });

  it("stelt niet voor bij 0 dagen (mandaat is net gezet)", () => {
    const verdict = evaluateMandateSuggestion({ ...basis, mandateSince: NOW });
    expect(verdict.propose).toBe(false);
    expect(verdict.evidence.dagen).toBe(0);
  });
});

describe("evaluateMandateSuggestion — 5 calls", () => {
  it("stelt niet voor bij 4 uitgevoerde calls", () => {
    const verdict = evaluateMandateSuggestion({ ...basis, doneCallCount: 4 });
    expect(verdict.propose).toBe(false);
    expect(verdict.evidence.calls).toBe(4);
  });

  it("stelt niet voor bij 0 calls, ook al staat het domein al maanden op niveau 2", () => {
    const verdict = evaluateMandateSuggestion({
      ...basis,
      mandateSince: daysAgo(365),
      doneCallCount: 0,
    });
    expect(verdict.propose).toBe(false);
  });
});

describe("evaluateMandateSuggestion — 0 rejected", () => {
  it("stelt niet voor zodra er ook maar 1 afwijzing in de periode staat", () => {
    const verdict = evaluateMandateSuggestion({ ...basis, rejectedCallCount: 1 });
    expect(verdict.propose).toBe(false);
    expect(verdict.evidence).toEqual({ dagen: 28, calls: 5, rejected: 1 });
  });

  it("blokkeert ook met veel calls en dagen als er één afwijzing tussen zit", () => {
    const verdict = evaluateMandateSuggestion({
      ...basis,
      mandateSince: daysAgo(120),
      doneCallCount: 50,
      rejectedCallCount: 1,
    });
    expect(verdict.propose).toBe(false);
  });
});

describe("evaluateMandateSuggestion — alleen niveau 2", () => {
  it("stelt niets voor op niveau 1", () => {
    expect(evaluateMandateSuggestion({ ...basis, mandateLevel: 1 }).propose).toBe(false);
  });

  it("stelt niets voor op niveau 3 — er is dan al niets te promoveren", () => {
    expect(evaluateMandateSuggestion({ ...basis, mandateLevel: 3 }).propose).toBe(false);
  });
});

describe("evaluateMandateSuggestion — eenmaligheid", () => {
  it("stelt niet nog een keer voor als er al een suggestie met to_level 3 bestaat", () => {
    const verdict = evaluateMandateSuggestion({ ...basis, alreadyHasLevel3Suggestion: true });
    expect(verdict.propose).toBe(false);
  });

  it("geldt ongeacht of alle andere voorwaarden ruim voldaan zijn", () => {
    const verdict = evaluateMandateSuggestion({
      ...basis,
      mandateSince: daysAgo(365),
      doneCallCount: 100,
      rejectedCallCount: 0,
      alreadyHasLevel3Suggestion: true,
    });
    expect(verdict.propose).toBe(false);
    // Het bewijs wordt nog steeds teruggegeven — alleen `propose` valt weg.
    expect(verdict.evidence.calls).toBe(100);
  });
});
