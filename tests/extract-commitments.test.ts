import { describe, expect, it, vi } from "vitest";
import {
  applyExtractionPlan,
  commitmentRow,
  parseExtractionJson,
  planExtractions,
  type EmailToExtract,
  type ExtractTx,
} from "@/brain/extract-commitments";
import type { LlmCaller, LlmResult } from "@/brain/llm";

/**
 * Net als tests/sync-engine.test.ts: gemockte LlmCaller en een neppe tx, geen
 * database of netwerk nodig.
 */

const email: EmailToExtract = {
  id: "email_1",
  subject: "Feedback op opzet",
  from_addr: "iris@example.com",
  is_sent: false,
  body_text: "Kun je deze week nog reageren op de opzet?",
  sent_at: new Date("2026-08-01T09:00:00Z"),
};

function fakeTx(): ExtractTx & {
  commitment: { create: ReturnType<typeof vi.fn> };
  email: { update: ReturnType<typeof vi.fn> };
} {
  return {
    commitment: { create: vi.fn().mockResolvedValue({}) },
    email: { update: vi.fn().mockResolvedValue({}) },
  };
}

describe("parseExtractionJson", () => {
  it("accepteert een geldige i_owe-uitkomst", () => {
    const decision = parseExtractionJson({
      direction: "i_owe",
      party: "Iris",
      what: "Reactie op opzet",
      context: "Vroeg om feedback",
      due_date: "2026-08-10",
      confidence: 0.9,
    });
    expect(decision).toEqual({
      direction: "i_owe",
      party: "Iris",
      what: "Reactie op opzet",
      context: "Vroeg om feedback",
      due_date: new Date("2026-08-10"),
      confidence: 0.9,
    });
  });

  it("geeft null terug bij 'none'", () => {
    expect(parseExtractionJson({ direction: "none", party: "", what: "", confidence: 0.95 })).toBeNull();
  });

  it("geeft null terug bij een onbekende direction", () => {
    expect(parseExtractionJson({ direction: "mutual", party: "Iris", what: "iets" })).toBeNull();
  });

  it("geeft null terug zonder party of what — liever geen rij dan giswerk", () => {
    expect(parseExtractionJson({ direction: "i_owe", party: "", what: "iets" })).toBeNull();
    expect(parseExtractionJson({ direction: "i_owe", party: "Iris", what: "" })).toBeNull();
  });

  it("geeft null terug bij iets dat geen object is", () => {
    expect(parseExtractionJson(null)).toBeNull();
    expect(parseExtractionJson("tekst")).toBeNull();
    expect(parseExtractionJson([1, 2])).toBeNull();
  });

  it("valt terug op confidence 0.5 bij een ontbrekende of ongeldige waarde", () => {
    expect(parseExtractionJson({ direction: "i_owe", party: "Iris", what: "iets" })?.confidence).toBe(0.5);
    expect(
      parseExtractionJson({ direction: "i_owe", party: "Iris", what: "iets", confidence: 2 })?.confidence,
    ).toBe(0.5);
  });

  it("zet een ongeldige due_date op null in plaats van te crashen", () => {
    expect(
      parseExtractionJson({ direction: "i_owe", party: "Iris", what: "iets", due_date: "geen-datum" })
        ?.due_date,
    ).toBeNull();
  });

  it("zet een lege of ontbrekende context op null", () => {
    expect(parseExtractionJson({ direction: "i_owe", party: "Iris", what: "iets" })?.context).toBeNull();
    expect(
      parseExtractionJson({ direction: "i_owe", party: "Iris", what: "iets", context: "   " })?.context,
    ).toBeNull();
  });
});

describe("commitmentRow", () => {
  it("zet de velden op de vorm die het Commitment-model verwacht", () => {
    const now = new Date("2026-08-07T08:00:00Z");
    const row = commitmentRow(
      { direction: "i_owe", party: "Iris", what: "Reactie op opzet", context: "context", due_date: null, confidence: 0.9 },
      email,
      "user_1",
      now,
    );
    expect(row).toMatchObject({
      user_id: "user_1",
      source: "email",
      source_ref: "email_1",
      direction: "i_owe",
      party: "Iris",
      what: "Reactie op opzet",
      context: "context",
      opened_at: now,
      confidence: 0.9,
    });
    expect(row.source_label).toMatch(/^mail \d{1,2}[-/]\d{1,2}$/);
  });

  it("kapt what/context af op hun budget", () => {
    const row = commitmentRow(
      {
        direction: "they_owe",
        party: "Iris",
        what: "x".repeat(500),
        context: "y".repeat(500),
        due_date: null,
        confidence: 0.5,
      },
      email,
      "user_1",
      new Date(),
    );
    expect((row.what as string).length).toBeLessThanOrEqual(100);
    expect((row.context as string).length).toBeLessThanOrEqual(200);
  });
});

function llmOk(json: unknown): LlmCaller {
  return vi.fn().mockResolvedValue({ ok: true, json } satisfies LlmResult);
}

function llmFail(reason: "not_configured" | "http_error" | "parse_error" = "http_error"): LlmCaller {
  return vi.fn().mockResolvedValue({ ok: false, reason, message: "kapot" } satisfies LlmResult);
}

describe("planExtractions", () => {
  it("plant een geldige beslissing per mail", async () => {
    const llmCall = llmOk({ direction: "i_owe", party: "Iris", what: "Reactie op opzet", confidence: 0.9 });

    const plans = await planExtractions([email], llmCall);

    expect(plans).toHaveLength(1);
    expect(plans[0].failed).toBe(false);
    expect(plans[0].decision).toMatchObject({ direction: "i_owe", party: "Iris" });
  });

  it("markeert 'none' als niet-mislukt met een lege decision", async () => {
    const llmCall = llmOk({ direction: "none", confidence: 0.95 });

    const plans = await planExtractions([email], llmCall);

    expect(plans[0].failed).toBe(false);
    expect(plans[0].decision).toBeNull();
  });

  it("markeert een mislukte aanroep als failed, niet als 'none'", async () => {
    const llmCall = llmFail("http_error");

    const plans = await planExtractions([email], llmCall);

    expect(plans[0].failed).toBe(true);
    expect(plans[0].decision).toBeNull();
  });

  it("isoleert een gooiende aanroep tot die ene mail", async () => {
    const tweedeMail: EmailToExtract = { ...email, id: "email_2" };
    const llmCall: LlmCaller = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true, json: { direction: "i_owe", party: "Iris", what: "iets" } });

    const plans = await planExtractions([email, tweedeMail], llmCall);

    expect(plans).toHaveLength(2);
    expect(plans[0].failed).toBe(true);
    expect(plans[1].failed).toBe(false);
    expect(plans[1].decision).toMatchObject({ party: "Iris" });
  });

  it("geeft de juiste prompt-invoer en het extractiemodel mee", async () => {
    const llmCall = llmOk({ direction: "none" });

    await planExtractions([email], llmCall);

    expect(llmCall).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5-20251001", maxTokens: expect.any(Number) }),
    );
    const prompt = (llmCall as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt as string;
    expect(prompt).toContain(email.subject);
    expect(prompt).toContain(email.from_addr);
  });
});

describe("applyExtractionPlan", () => {
  it("maakt een commitment aan en zet processed_at bij een geldige beslissing", async () => {
    const tx = fakeTx();
    const now = new Date("2026-08-07T08:00:00Z");
    const plans = [
      {
        email,
        decision: {
          direction: "i_owe" as const,
          party: "Iris",
          what: "Reactie op opzet",
          context: null,
          due_date: null,
          confidence: 0.9,
        },
        failed: false,
      },
    ];

    const outcome = await applyExtractionPlan(tx, "user_1", plans, now);

    expect(outcome).toEqual({ created: 1, skipped: 0 });
    expect(tx.commitment.create).toHaveBeenCalledTimes(1);
    expect(tx.email.update).toHaveBeenCalledWith({ where: { id: email.id }, data: { processed_at: now } });
  });

  it("markeert processed_at zonder commitment bij 'none' (decision: null, failed: false)", async () => {
    const tx = fakeTx();
    const now = new Date();

    const outcome = await applyExtractionPlan(tx, "user_1", [{ email, decision: null, failed: false }], now);

    expect(outcome).toEqual({ created: 0, skipped: 0 });
    expect(tx.commitment.create).not.toHaveBeenCalled();
    expect(tx.email.update).toHaveBeenCalledWith({ where: { id: email.id }, data: { processed_at: now } });
  });

  it("laat processed_at ongemoeid bij een mislukte aanroep — volgende tick probeert opnieuw", async () => {
    const tx = fakeTx();
    const now = new Date();

    const outcome = await applyExtractionPlan(tx, "user_1", [{ email, decision: null, failed: true }], now);

    expect(outcome).toEqual({ created: 0, skipped: 1 });
    expect(tx.commitment.create).not.toHaveBeenCalled();
    expect(tx.email.update).not.toHaveBeenCalled();
  });

  it("telt gemengde uitkomsten in een batch correct op", async () => {
    const tx = fakeTx();
    const now = new Date();
    const plans = [
      {
        email: { ...email, id: "e1" },
        decision: {
          direction: "they_owe" as const,
          party: "Deniz",
          what: "Opties voor afspraak",
          context: null,
          due_date: null,
          confidence: 0.8,
        },
        failed: false,
      },
      { email: { ...email, id: "e2" }, decision: null, failed: false },
      { email: { ...email, id: "e3" }, decision: null, failed: true },
    ];

    const outcome = await applyExtractionPlan(tx, "user_1", plans, now);

    expect(outcome).toEqual({ created: 1, skipped: 1 });
    expect(tx.commitment.create).toHaveBeenCalledTimes(1);
    expect(tx.email.update).toHaveBeenCalledTimes(2); // e1 en e2, niet e3
  });
});
