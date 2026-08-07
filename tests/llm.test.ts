import { describe, expect, it, vi, afterEach } from "vitest";
import { callAnthropic, extractResponseText, firstJsonBlock, isAnthropicConfigured } from "@/brain/llm";

/**
 * Alleen de pure kant (firstJsonBlock, extractResponseText) zonder netwerk,
 * plus callAnthropic met een gemockte fetch — zelfde opzet als
 * tests/google-token.test.ts voor src/lib/auth/google-token.ts.
 */

describe("firstJsonBlock", () => {
  it("parset een schoon JSON-object", () => {
    expect(firstJsonBlock('{"a":1}')).toEqual({ a: 1 });
  });

  it("pakt het eerste blok als er tekst omheen staat", () => {
    const text = 'Hier is het antwoord:\n{"frog_title":"Bel Iris","frog_sub":"vandaag"}\nLaat het weten.';
    expect(firstJsonBlock(text)).toEqual({ frog_title: "Bel Iris", frog_sub: "vandaag" });
  });

  it("negeert accolades binnen een string-waarde", () => {
    const text = '{"what":"iets met een { erin","context":"nog een } hier"}';
    expect(firstJsonBlock(text)).toEqual({ what: "iets met een { erin", context: "nog een } hier" });
  });

  it("geeft null terug zonder accolades", () => {
    expect(firstJsonBlock("geen json hier")).toBeNull();
  });

  it("geeft null terug bij een nooit gesloten blok (afgekapt op max_tokens)", () => {
    expect(firstJsonBlock('{"a": "b longer than expected and cut off')).toBeNull();
  });

  it("geeft null terug bij kapotte JSON binnen de accolades", () => {
    expect(firstJsonBlock("{niet: geldig, json}")).toBeNull();
  });

  it("vindt een genest object correct af (diepte-telling)", () => {
    const text = '{"outer":{"inner":"waarde"},"top":true}';
    expect(firstJsonBlock(text)).toEqual({ outer: { inner: "waarde" }, top: true });
  });
});

describe("extractResponseText", () => {
  it("voegt tekstblokken samen", () => {
    const body = { content: [{ type: "text", text: "deel1" }, { type: "text", text: "deel2" }] };
    expect(extractResponseText(body)).toBe("deel1deel2");
  });

  it("negeert non-text blokken (bv. tool_use)", () => {
    const body = { content: [{ type: "tool_use", id: "x" }, { type: "text", text: "hallo" }] };
    expect(extractResponseText(body)).toBe("hallo");
  });

  it("geeft null terug zonder content-array", () => {
    expect(extractResponseText({})).toBeNull();
    expect(extractResponseText(null)).toBeNull();
    expect(extractResponseText("string")).toBeNull();
  });

  it("geeft null terug bij een lege content-array", () => {
    expect(extractResponseText({ content: [] })).toBeNull();
  });
});

describe("isAnthropicConfigured / callAnthropic zonder key", () => {
  const origKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (origKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = origKey;
    vi.unstubAllGlobals();
  });

  it("meldt niet geconfigureerd zonder key, zonder te crashen", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAnthropicConfigured()).toBe(false);

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await callAnthropic({ prompt: "test", model: "claude-haiku-4-5-20251001", maxTokens: 100 });

    expect(result).toEqual({ ok: false, reason: "not_configured", message: expect.any(String) });
    expect(fetchSpy).not.toHaveBeenCalled(); // geen netwerkaanroep zonder key
  });
});

describe("callAnthropic met key", () => {
  const origKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (origKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = origKey;
    vi.unstubAllGlobals();
  });

  it("geeft de geparste JSON terug bij een geldig antwoord", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: "text", text: '{"frog_title":"Bel Iris"}' }] }),
      }),
    );

    const result = await callAnthropic({ prompt: "test", model: "claude-sonnet-5", maxTokens: 100 });

    expect(result).toEqual({ ok: true, json: { frog_title: "Bel Iris" } });
  });

  it("stuurt de juiste headers en body mee", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: "{}" }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await callAnthropic({ prompt: "mijn prompt", model: "claude-haiku-4-5-20251001", maxTokens: 250 });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "sk-test",
          "anthropic-version": "2023-06-01",
        }),
      }),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: "claude-haiku-4-5-20251001", max_tokens: 250 });
    expect(body.messages).toEqual([{ role: "user", content: "mijn prompt" }]);
  });

  it("geeft een http_error terug bij een niet-2xx status, zonder te gooien", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 529, text: async () => "overloaded" }),
    );

    const result = await callAnthropic({ prompt: "test", model: "claude-sonnet-5", maxTokens: 100 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("http_error");
      expect(result.message).toContain("529");
    }
  });

  it("geeft een parse_error terug zonder tekst in het antwoord", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: [] }) }),
    );

    const result = await callAnthropic({ prompt: "test", model: "claude-sonnet-5", maxTokens: 100 });

    expect(result).toEqual({ ok: false, reason: "parse_error", message: expect.any(String) });
  });

  it("geeft een parse_error terug bij tekst zonder JSON-blok", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: "text", text: "geen json hier" }] }),
      }),
    );

    const result = await callAnthropic({ prompt: "test", model: "claude-sonnet-5", maxTokens: 100 });

    expect(result).toEqual({ ok: false, reason: "parse_error", message: expect.any(String) });
  });

  it("vangt een netwerkfout op als http_error i.p.v. te gooien", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));

    const result = await callAnthropic({ prompt: "test", model: "claude-sonnet-5", maxTokens: 100 });

    expect(result).toEqual({ ok: false, reason: "http_error", message: "ECONNRESET" });
  });
});
