import { describe, expect, it, vi } from "vitest";
import { detectDeadline24h, detectMoneyUnexpected, TRIGGERS } from "@/lib/escalation/triggers";
import {
  planEscalations,
  processUserEscalations,
  type EscalationTx,
  type PlanInput,
} from "@/lib/escalation/engine";

/**
 * Net als tests/sync-engine.test.ts en tests/extract-commitments.test.ts:
 * een gemockte tx en een meegegeven klok, geen database nodig. De pure kern
 * (planEscalations, de detectors) staat los getest van de tx-laag eromheen.
 */

const TZ = "Europe/Amsterdam";
const NOW = new Date("2026-08-06T10:00:00Z"); // 12:00 lokaal

const basisInput: PlanInput = {
  now: NOW,
  timezone: TZ,
  quietHours: undefined,
  commitments: [],
  transactions: [],
  alreadyEscalated: [],
  escalatedTodayCount: 0,
};

describe("registry", () => {
  it("heeft twee echte triggers en twee ongeïmplementeerde placeholders", () => {
    const echte = TRIGGERS.filter((t) => t.enabled).map((t) => t.id);
    const placeholders = TRIGGERS.filter((t) => !t.enabled).map((t) => t.id);
    expect(echte.sort()).toEqual(["deadline_24h", "money_unexpected"]);
    expect(placeholders.sort()).toEqual(["children", "housing_longterm"]);
  });

  it("elke trigger heeft een label en omschrijving, ook de placeholders", () => {
    for (const trigger of TRIGGERS) {
      expect(trigger.label.length).toBeGreaterThan(0);
      expect(trigger.description.length).toBeGreaterThan(0);
    }
  });
});

describe("detectDeadline24h", () => {
  it("ziet een open commitment met due_date binnen 24 uur", () => {
    const in12h = new Date(NOW.getTime() + 12 * 3600_000);
    const result = detectDeadline24h(
      [{ id: "c1", status: "open", due_date: in12h }],
      NOW,
    );
    expect(result).toEqual([
      { trigger: "deadline_24h", ref_id: "c1", message: expect.any(String) },
    ]);
  });

  it("negeert een deadline verder dan 24 uur weg", () => {
    const in48h = new Date(NOW.getTime() + 48 * 3600_000);
    expect(detectDeadline24h([{ id: "c1", status: "open", due_date: in48h }], NOW)).toEqual([]);
  });

  it("negeert een deadline die al verstreken is", () => {
    const gisteren = new Date(NOW.getTime() - 3600_000);
    expect(detectDeadline24h([{ id: "c1", status: "open", due_date: gisteren }], NOW)).toEqual([]);
  });

  it("negeert een commitment zonder due_date of die niet open is", () => {
    const in12h = new Date(NOW.getTime() + 12 * 3600_000);
    expect(detectDeadline24h([{ id: "c1", status: "open", due_date: null }], NOW)).toEqual([]);
    expect(detectDeadline24h([{ id: "c2", status: "done", due_date: in12h }], NOW)).toEqual([]);
  });

  it("nooit een bedrag in de boodschap", () => {
    const in12h = new Date(NOW.getTime() + 12 * 3600_000);
    const [candidate] = detectDeadline24h([{ id: "c1", status: "open", due_date: in12h }], NOW);
    expect(candidate.message).not.toMatch(/€/);
  });
});

describe("detectMoneyUnexpected", () => {
  it("ziet een transactie die needs_review draagt", () => {
    expect(detectMoneyUnexpected([{ id: "t1", needs_review: true }])).toEqual([
      { trigger: "money_unexpected", ref_id: "t1", message: expect.any(String) },
    ]);
  });

  it("negeert een transactie die al gecategoriseerd is", () => {
    expect(detectMoneyUnexpected([{ id: "t1", needs_review: false }])).toEqual([]);
  });

  it("nooit een bedrag of schuldeisernaam in de boodschap", () => {
    const [candidate] = detectMoneyUnexpected([{ id: "t1", needs_review: true }]);
    expect(candidate.message).not.toMatch(/€|\d/);
  });

  it("de boodschap is een vaste generieke tekst — geen interpolatie van transactievelden", () => {
    const [candidate] = detectMoneyUnexpected([{ id: "t1", needs_review: true }]);
    expect(candidate.message).toBe("Er wacht een transactie op je controle.");
  });
});

describe("planEscalations — dagcap", () => {
  it("laat maximaal twee kandidaten door, ook als er meer kandidaten zijn", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [
        { id: "c1", status: "open", due_date: in1h },
        { id: "c2", status: "open", due_date: in1h },
      ],
      transactions: [{ id: "t1", needs_review: true }],
    });
    expect(plan.toEscalate).toHaveLength(2);
  });

  it("houdt rekening met wat er vandaag al geëscaleerd is", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
      transactions: [{ id: "t1", needs_review: true }],
      escalatedTodayCount: 1,
    });
    expect(plan.toEscalate).toHaveLength(1);
  });

  it("laat niets meer door zodra de dagcap al vol is", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
      escalatedTodayCount: 2,
    });
    expect(plan.toEscalate).toEqual([]);
  });
});

describe("planEscalations — dedupe", () => {
  it("escaleert een ref_id niet nog een keer voor dezelfde trigger", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
      alreadyEscalated: [{ trigger: "deadline_24h", ref_id: "c1" }],
    });
    expect(plan.toEscalate).toEqual([]);
  });

  it("dedupe geldt per trigger — dezelfde ref_id onder een andere trigger blijft kandidaat", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [{ id: "x1", status: "open", due_date: in1h }],
      alreadyEscalated: [{ trigger: "money_unexpected", ref_id: "x1" }],
    });
    expect(plan.toEscalate).toEqual([
      { trigger: "deadline_24h", ref_id: "x1", message: expect.any(String) },
    ]);
  });
});

describe("planEscalations — stille uren", () => {
  it("escaleert niets binnen het venster en zegt dat het is uitgesteld", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    // 12:00 lokaal ligt binnen 10:00-14:00.
    const plan = planEscalations({
      ...basisInput,
      quietHours: "10:00-14:00",
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
    });
    expect(plan).toEqual({ deferredQuietHours: true, toEscalate: [] });
  });

  it("escaleert gewoon buiten het venster", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      quietHours: "22:00-08:00",
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
    });
    expect(plan.deferredQuietHours).toBe(false);
    expect(plan.toEscalate).toHaveLength(1);
  });
});

function fakeTx(overrides: {
  quietHours?: string;
  commitments?: Array<{ id: string; status: string; due_date: Date | null }>;
  transactions?: Array<{ id: string; needs_review: boolean }>;
  existingEvents?: Array<{ trigger: string; ref_id: string; created_at: Date }>;
  createImpl?: ReturnType<typeof vi.fn>;
}): EscalationTx & { escalationEvent: { create: ReturnType<typeof vi.fn> } } {
  return {
    userSetting: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.quietHours ? { value: overrides.quietHours } : null,
      ),
    },
    commitment: { findMany: vi.fn().mockResolvedValue(overrides.commitments ?? []) },
    transaction: { findMany: vi.fn().mockResolvedValue(overrides.transactions ?? []) },
    escalationEvent: {
      findMany: vi.fn().mockResolvedValue(overrides.existingEvents ?? []),
      create: overrides.createImpl ?? vi.fn().mockResolvedValue({}),
    },
  };
}

describe("processUserEscalations — de onzuivere laag", () => {
  it("schrijft een EscalationEvent weg per gekozen kandidaat", async () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const tx = fakeTx({ commitments: [{ id: "c1", status: "open", due_date: in1h }] });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    expect(created).toHaveLength(1);
    expect(tx.escalationEvent.create).toHaveBeenCalledWith({
      data: { user_id: "user_1", trigger: "deadline_24h", ref_id: "c1", message: expect.any(String) },
    });
  });

  it("telt escalatedTodayCount uit created_at in de tijdzone van de gebruiker, niet in UTC", async () => {
    // 23:30 UTC op 5 augustus is 01:30 op 6 augustus in Amsterdam (zomertijd) —
    // dus "vandaag" (6 augustus lokaal) al één escalatie, ook al staat de
    // created_at-timestamp nog op 5 augustus in UTC.
    const gisterenAvondUtc = new Date("2026-08-05T23:30:00Z");
    const in1h = new Date(NOW.getTime() + 3600_000);
    const tx = fakeTx({
      commitments: [
        { id: "c1", status: "open", due_date: in1h },
        { id: "c2", status: "open", due_date: in1h },
      ],
      existingEvents: [
        { trigger: "deadline_24h", ref_id: "oud", created_at: gisterenAvondUtc },
      ],
    });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    // Cap is 2, er stond al 1 vandaag (lokaal), dus nog maar 1 slot over.
    expect(created).toHaveLength(1);
  });

  it("slaat een unieke-sleutelbotsing bij het schrijven stil over", async () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const create = vi.fn().mockRejectedValue(new Error("unique constraint"));
    const tx = fakeTx({
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
      createImpl: create,
    });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    expect(created).toEqual([]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("doet niets en schrijft niets tijdens stille uren", async () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const tx = fakeTx({
      quietHours: "10:00-14:00", // NOW is 12:00 lokaal
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
    });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    expect(created).toEqual([]);
    expect(tx.escalationEvent.create).not.toHaveBeenCalled();
  });
});
