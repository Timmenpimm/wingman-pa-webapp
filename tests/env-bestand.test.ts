import { describe, expect, it } from "vitest";
// @ts-expect-error — los scriptbestand zonder types; bewust geen build-stap voor scripts/.
import { controleer, huidigeWaarde, zet } from "../scripts/env-bestand.mjs";

const BESTAAND = `# Wingman — lokale omgeving
DATABASE_URL="postgresql://app_user:x@localhost:5433/wingman"

# Auth
AUTH_SECRET="al-gezet"
AUTH_GOOGLE_ID=
`;

describe("env-bestand lezen", () => {
  it("ziet een gezette waarde, met of zonder aanhalingstekens", () => {
    expect(huidigeWaarde(BESTAAND, "AUTH_SECRET")).toBe("al-gezet");
    expect(huidigeWaarde('X=zonder\n', "X")).toBe("zonder");
  });

  it("behandelt een lege sleutel als niet gezet", () => {
    // Anders vraagt het script "overschrijven?" over een regel die er alleen
    // maar als sjabloon staat.
    expect(huidigeWaarde(BESTAAND, "AUTH_GOOGLE_ID")).toBeNull();
    expect(huidigeWaarde(BESTAAND, "BESTAAT_NIET")).toBeNull();
  });
});

describe("env-bestand schrijven", () => {
  it("vervangt een bestaande regel op zijn plek", () => {
    const na = zet(BESTAAND, "AUTH_GOOGLE_ID", "123.apps.googleusercontent.com");
    expect(na).toContain('AUTH_GOOGLE_ID="123.apps.googleusercontent.com"');
    expect(na.match(/AUTH_GOOGLE_ID=/g)).toHaveLength(1);
  });

  it("laat comments en andere sleutels ongemoeid", () => {
    const na = zet(BESTAAND, "AUTH_GOOGLE_SECRET", "GOCSPX-x");
    expect(na).toContain("# Wingman — lokale omgeving");
    expect(na).toContain('DATABASE_URL="postgresql://app_user:x@localhost:5433/wingman"');
    expect(na).toContain('AUTH_SECRET="al-gezet"');
  });

  it("plakt een nieuwe sleutel erachter, met precies één regeleinde ertussen", () => {
    const na = zet('A="1"\n', "B", "2");
    expect(na).toBe('A="1"\nB="2"\n');
  });

  it("werkt op een leeg bestand", () => {
    expect(zet("", "A", "1")).toBe('A="1"\n');
  });
});

describe("controle op geplakte waarden", () => {
  it("laat een geldig paar zonder klachten door", () => {
    expect(controleer("123-abc.apps.googleusercontent.com", "GOCSPX-geheim")).toEqual([]);
  });

  it("herkent de gebruikelijke plakfouten", () => {
    expect(controleer("123-abc", "GOCSPX-geheim")).toHaveLength(1);
    expect(controleer("123-abc.apps.googleusercontent.com", "geheim")).toHaveLength(1);
    // Half geplakt: spatie erin. Levert twee klachten op, dat is prima — het
    // gaat om de waarschuwing, niet om het aantal.
    expect(controleer("123 abc", "GOCSPX-geheim").length).toBeGreaterThan(0);
  });
});
