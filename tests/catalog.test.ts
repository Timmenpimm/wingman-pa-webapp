import { describe, expect, it } from "vitest";
import { addableRows, catalogRows } from "@/connectors/catalog";

/**
 * "Bron toevoegen" op Instellingen mag maar één belofte doen: een knop staat
 * er alleen als er ook echt een koppelroute achter zit. Deze tests bewaken die
 * regel en het geval waar het blok voor bestaat — de bank die iemand tijdens
 * de kennismaking oversloeg.
 */

const vol = { googleConfigured: true, pontoUrl: "https://nango.test/oauth/connect/ponto" };
const leeg = { googleConfigured: false, pontoUrl: null };

function rij(input: Parameters<typeof catalogRows>[0], provider: string) {
  return catalogRows(input).find((r) => r.provider === provider)!;
}

describe("wat er nog bij kan", () => {
  it("biedt de bank aan als de omgeving hem aankan", () => {
    const bank = rij({ connected: [], marks: {}, ...vol }, "ponto");
    expect(bank.state).toBe("available");
    expect(bank.connect).toEqual({ kind: "link", href: "/api/v1/connect/ponto" });
  });

  it("belooft geen knop zonder Nango", () => {
    const bank = rij({ connected: [], marks: {}, ...leeg }, "ponto");
    expect(bank.state).toBe("unavailable");
    expect(bank.connect).toBeUndefined();
    expect(bank.note).toContain("omgeving");
  });

  it("belooft geen Google-knop zonder Google-config", () => {
    expect(rij({ connected: [], marks: {}, ...leeg }, "google").connect).toBeUndefined();
    expect(rij({ connected: [], marks: {}, ...vol }, "google").connect).toEqual({ kind: "google" });
  });

  it("geeft CalDAV en IMAP geen knop — daar is geen flow voor", () => {
    for (const provider of ["caldav", "imap", "telegram"]) {
      expect(rij({ connected: [], marks: {}, ...vol }, provider).state).toBe("unavailable");
    }
  });

  it("onthoudt dat je een stap overgeslagen hebt", () => {
    const bank = rij({ connected: [], marks: { bank: "skipped" }, ...vol }, "ponto");
    expect(bank.skipped).toBe(true);
    // Overgeslagen is geen eindstation: de knop blijft staan.
    expect(bank.state).toBe("available");
  });

  it("houdt een haperende bron uit het toevoeg-blok", () => {
    // reauth_required is gekoppeld-maar-stuk (regel 2). Dat hoort bij Bronnen
    // thuis, niet bij "toevoegen" — anders koppel je hem per ongeluk dubbel.
    const rows = catalogRows({ connected: ["gmail"], marks: {}, ...vol });
    expect(rij({ connected: ["gmail"], marks: {}, ...vol }, "gmail").state).toBe("connected");
    expect(addableRows(rows).map((r) => r.provider)).not.toContain("gmail");
  });

  it("laat niets zien als alles wat kan al gekoppeld is", () => {
    const rows = catalogRows({
      connected: ["google", "gmail", "ponto", "caldav", "imap", "telegram"],
      marks: {},
      ...vol,
    });
    expect(addableRows(rows)).toHaveLength(0);
  });
});
