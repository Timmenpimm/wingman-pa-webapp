import { describe, expect, it } from "vitest";

/**
 * Het e-mailadres bepaalt twee dingen tegelijk: waar de briefing van 08:00
 * heen gaat, en waarmee je inlogt. Daarom staat de validatie hier vast — een
 * typefout betekent niet "geen mail", maar "geen mail én ik kan er niet meer
 * in".
 *
 * De regexp is bewust dezelfde als in updateEmail(); dit legt het gedrag vast
 * voordat iemand hem "even" versoepelt.
 */

const geldig = (adres: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adres.trim().toLowerCase());

describe("welk adres accepteren we", () => {
  it("gewone adressen", () => {
    expect(geldig("m.harpe@i2o.nl")).toBe(true);
    expect(geldig("nora+wingman@voorbeeld.nl")).toBe(true);
    expect(geldig("  M.Harpe@I2O.NL  ")).toBe(true); // spaties en hoofdletters
  });

  it("weigert wat geen adres is", () => {
    expect(geldig("")).toBe(false);
    expect(geldig("martijn")).toBe(false);
    expect(geldig("martijn@")).toBe(false);
    expect(geldig("@i2o.nl")).toBe(false);
    expect(geldig("martijn@i2o")).toBe(false); // geen punt in het domein
    expect(geldig("twee@adressen@i2o.nl")).toBe(false);
    expect(geldig("met spatie@i2o.nl")).toBe(false);
  });

  it("normaliseert naar kleine letters", () => {
    // Anders logt iemand in met M.Harpe@ en vindt de app niets, terwijl het
    // adres er wél staat.
    expect("  M.Harpe@I2O.NL  ".trim().toLowerCase()).toBe("m.harpe@i2o.nl");
  });
});
