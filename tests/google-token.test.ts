import { describe, expect, it } from "vitest";
import { ReauthRequiredError, needsRefresh, parseRefreshResponse } from "@/lib/auth/google-token";

/**
 * Alleen de pure kant van de refresh-helper (geen fetch, geen database) — zie
 * de toelichting bovenaan src/lib/auth/google-token.ts voor waarom die
 * scheiding er is.
 */
describe("needsRefresh", () => {
  const now = new Date("2026-08-05T12:00:00Z");

  it("zegt ja zonder expires_at (nooit gehad, dus onbekend = onveilig)", () => {
    expect(needsRefresh(null, now)).toBe(true);
  });

  it("zegt nee ruim vóór verlopen", () => {
    const expires = new Date(now.getTime() + 30 * 60_000);
    expect(needsRefresh(expires, now)).toBe(false);
  });

  it("zegt ja binnen de veiligheidsmarge vóór verlopen", () => {
    const expires = new Date(now.getTime() + 30_000); // < 60s marge
    expect(needsRefresh(expires, now)).toBe(true);
  });

  it("zegt ja na verlopen", () => {
    const expires = new Date(now.getTime() - 1_000);
    expect(needsRefresh(expires, now)).toBe(true);
  });
});

describe("parseRefreshResponse", () => {
  const now = new Date("2026-08-05T12:00:00Z");

  it("geeft een geldig token terug bij een 200", () => {
    const result = parseRefreshResponse(200, { access_token: "nieuw-token", expires_in: 3600 }, now);
    expect(result.access_token).toBe("nieuw-token");
    expect(result.expires_at.getTime()).toBe(now.getTime() + 3600_000);
  });

  it("gooit ReauthRequiredError bij invalid_grant", () => {
    expect(() => parseRefreshResponse(400, { error: "invalid_grant" }, now)).toThrow(ReauthRequiredError);
  });

  it("gooit een gewone fout bij een andere 400", () => {
    expect(() => parseRefreshResponse(400, { error: "invalid_request" }, now)).toThrow(
      /Google token-refresh mislukt/,
    );
    expect(() => parseRefreshResponse(400, { error: "invalid_request" }, now)).not.toThrow(ReauthRequiredError);
  });

  it("gooit een fout bij een 5xx zonder error-veld", () => {
    expect(() => parseRefreshResponse(503, {}, now)).toThrow(/Google token-refresh mislukt/);
  });

  it("gooit een fout bij een onverwacht geformeerd succesvol antwoord", () => {
    expect(() => parseRefreshResponse(200, { access_token: "x" }, now)).toThrow(/Onverwacht antwoord/);
    expect(() => parseRefreshResponse(200, {}, now)).toThrow(/Onverwacht antwoord/);
  });
});
