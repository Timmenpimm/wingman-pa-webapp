import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptOptional,
  decryptSecret,
  encryptOptional,
  encryptSecret,
  isEncrypted,
  vergeetSleutel,
} from "@/lib/crypto/secrets";

/**
 * Wat hier misgaat, gaat stil mis: een token dat onversleuteld wordt
 * weggeschreven ziet er in de database uit als een token dat wél versleuteld
 * is — tot iemand de dump in handen krijgt.
 */

const SLEUTEL = Buffer.alloc(32, 7).toString("base64");
const ANDERE_SLEUTEL = Buffer.alloc(32, 9).toString("base64");

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = SLEUTEL;
  vergeetSleutel();
});

describe("tokens versleutelen", () => {
  it("levert de oorspronkelijke waarde weer op", () => {
    const token = "1//0eXaMpLe-refresh-token";
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it("laat het token niet meer in de opgeslagen waarde staan", () => {
    const token = "geheim-token";
    const opgeslagen = encryptSecret(token);
    expect(opgeslagen).not.toContain(token);
    expect(isEncrypted(opgeslagen)).toBe(true);
  });

  it("geeft twee keer een andere uitkomst voor dezelfde invoer", () => {
    // Zonder willekeurige IV zie je in de database welke gebruikers hetzelfde
    // token hebben — en dat is al informatie.
    expect(encryptSecret("zelfde")).not.toBe(encryptSecret("zelfde"));
  });

  it("weigert een geknoeide waarde in plaats van iets anders terug te geven", () => {
    const opgeslagen = encryptSecret("token");
    const delen = opgeslagen.split(".");
    const geknoeid = [delen[0], delen[1], delen[2], "AAAA" + delen[3].slice(4)].join(".");
    expect(() => decryptSecret(geknoeid)).toThrow(/niet ontsleuteld/);
  });

  it("weigert een andere sleutel", () => {
    const opgeslagen = encryptSecret("token");
    process.env.TOKEN_ENCRYPTION_KEY = ANDERE_SLEUTEL;
    vergeetSleutel();
    expect(() => decryptSecret(opgeslagen)).toThrow(/niet ontsleuteld/);
  });

  it("laat oude, onversleutelde waarden werken tot ze omgezet zijn", () => {
    expect(decryptSecret("plat-token-van-voor-deze-wijziging")).toBe(
      "plat-token-van-voor-deze-wijziging",
    );
    expect(isEncrypted("plat-token-van-voor-deze-wijziging")).toBe(false);
  });

  it("laat lege kolommen leeg", () => {
    expect(encryptOptional(null)).toBeNull();
    expect(encryptOptional("")).toBeNull();
    expect(decryptOptional(null)).toBeUndefined();
  });

  it("zegt het duidelijk als de sleutel ontbreekt", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    vergeetSleutel();
    expect(() => encryptSecret("x")).toThrow(/TOKEN_ENCRYPTION_KEY ontbreekt/);
  });

  it("weigert een sleutel van de verkeerde lengte", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    vergeetSleutel();
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});
