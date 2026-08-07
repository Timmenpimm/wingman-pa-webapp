import { describe, expect, it } from "vitest";
import { gate } from "@/lib/tools/permission";
import { assertNoMailSending, domainsFor, findTool, toolCatalog } from "@/lib/tools/registry";
import { asToolError } from "@/lib/tools/execute";
import { ToolError, type ToolEffect } from "@/lib/tools/types";
import { adapterFor } from "@/connectors";
import { needsRefresh, ReauthRequiredError } from "@/lib/auth/google-token";
import { asPermission } from "@/lib/types";
import {
  asLevel,
  asNotifyPreference,
  DOMAINS,
  LEVELS,
  mostRestrictiveLevel,
  type MandateLevel,
} from "@/lib/mandates/domains";
import { combineMandates, deriveMandateFromPermission } from "@/lib/mandates/derive";
import { shouldDegradeOnFailure } from "@/lib/mandates/degrade";

const base = {
  connectorLabel: "Gmail",
  connectorStatus: "active" as const,
  level: 1 as MandateLevel,
  notifyPreference: "melden" as const,
  effect: "read" as ToolEffect,
};

describe("permissiepoort (gate v2 — mandaatniveau per domein)", () => {
  it("laat lezen toe op elk niveau", () => {
    for (const level of LEVELS) {
      const verdict = gate({ ...base, level, effect: "read" });
      expect(verdict.allow, String(level)).toBe(true);
      expect(verdict.allow && verdict.requiresApproval).toBe(false);
      expect(verdict.allow && verdict.notify).toBe(false);
    }
  });

  it("niveau 1 (signaleren) vraagt om een ja, ook voor een concept", () => {
    for (const effect of ["draft", "write"] as ToolEffect[]) {
      const verdict = gate({ ...base, level: 1, effect });
      expect(verdict.allow).toBe(true);
      expect(verdict.allow && verdict.requiresApproval, effect).toBe(true);
      expect(verdict.allow && verdict.notify).toBe(false);
    }
  });

  it("niveau 2 (klaarzetten) doet concepten zelf, maar vraagt bij write", () => {
    expect(gate({ ...base, level: 2, effect: "draft" })).toMatchObject({
      allow: true,
      requiresApproval: false,
      notify: false,
    });
    expect(gate({ ...base, level: 2, effect: "write" })).toMatchObject({
      allow: true,
      requiresApproval: true,
    });
  });

  it("niveau 3 (doen) doet draft én write zelf", () => {
    for (const effect of ["draft", "write"] as ToolEffect[]) {
      const verdict = gate({ ...base, level: 3, effect });
      expect(verdict.allow).toBe(true);
      expect(verdict.allow && verdict.requiresApproval, effect).toBe(false);
    }
  });

  it("meldt bij niveau 3 alleen als de voorkeur 'melden' is", () => {
    expect(
      gate({ ...base, level: 3, effect: "write", notifyPreference: "melden" }),
    ).toMatchObject({ allow: true, requiresApproval: false, notify: true });
    expect(gate({ ...base, level: 3, effect: "write", notifyPreference: "stil" })).toMatchObject({
      allow: true,
      requiresApproval: false,
      notify: false,
    });
  });

  it("meldt niet wat de gebruiker zelf net heeft goedgekeurd (niveau 1 en 2)", () => {
    expect(gate({ ...base, level: 1, effect: "write" }).allow).toBe(true);
    expect(gate({ ...base, level: 1, effect: "write" })).toMatchObject({ notify: false });
    expect(gate({ ...base, level: 2, effect: "draft" })).toMatchObject({ notify: false });
  });

  it("blokkeert op de staat van de connector vóór het mandaat", () => {
    // Niveau 3 is de ruimste stand; een verlopen token wint daar alsnog van.
    const verlopen = gate({ ...base, level: 3, effect: "write", connectorStatus: "reauth_required" });
    expect(verlopen.allow).toBe(false);
    expect(!verlopen.allow && verlopen.error.code).toBe("Authentication");

    const weg = gate({ ...base, level: 3, connectorStatus: "not_connected" });
    expect(!weg.allow && weg.error.code).toBe("ConnectorOffline");
  });

  it("laat lezen van een bron in error toe, maar geen handelen", () => {
    expect(gate({ ...base, connectorStatus: "error", effect: "read" }).allow).toBe(true);
    expect(gate({ ...base, connectorStatus: "error", effect: "write", level: 3 }).allow).toBe(
      false,
    );
    expect(!gate({ ...base, connectorStatus: "error", effect: "write", level: 3 }).allow).toBe(
      true,
    );
  });

  it("valt terug op de voorzichtigste stand bij onzin in de database", () => {
    expect(asLevel(2)).toBe(2);
    expect(asLevel("3")).toBe(3);
    expect(asLevel(0)).toBe(1);
    expect(asLevel(null)).toBe(1);
    expect(asLevel(undefined)).toBe(1);
    expect(asLevel("kapot")).toBe(1);
  });

  it("valt terug op 'melden' bij onzin in de meldingsvoorkeur", () => {
    expect(asNotifyPreference("stil")).toBe("stil");
    expect(asNotifyPreference("melden")).toBe("melden");
    expect(asNotifyPreference(undefined)).toBe("melden");
    expect(asNotifyPreference("kapot")).toBe("melden");
  });

  // Connector.permission blijft nog even bestaan (verwijderen komt later),
  // dus asPermission() blijft die kolom geldig houden — ook al leest gate()
  // 'm niet meer.
  it("valt terug op de strengste oude stand bij onzin in Connector.permission", () => {
    expect(asPermission("act_and_report")).toBe("act_and_report");
    expect(asPermission("")).toBe("propose");
    expect(asPermission("admin")).toBe("propose");
  });
});

describe("degradatieregel (vertrouwensloop, fase 1 — shouldDegradeOnFailure)", () => {
  it("degradeert een write die zelfstandig liep (niveau 3, geen goedkeuring vooraf)", () => {
    expect(shouldDegradeOnFailure("write", true)).toBe(true);
  });

  it("degradeert niet als er wél per-actie-goedkeuring was, ook al is het effect write", () => {
    // Niveau 1/2: de gebruiker zei al "ja" tegen precies déze actie — dat is
    // geen zelfstandig handelen, dus geen reden om het mandaat te verlagen.
    expect(shouldDegradeOnFailure("write", false)).toBe(false);
  });

  it("degradeert nooit bij read of draft, autonoom of niet", () => {
    for (const ranAutonomously of [true, false]) {
      expect(shouldDegradeOnFailure("read", ranAutonomously)).toBe(false);
      expect(shouldDegradeOnFailure("draft", ranAutonomously)).toBe(false);
    }
  });

  it("read en draft draaien altijd autonoom volgens gate() vanaf niveau 2 — ook dan geen degradatie", () => {
    // Sanity check op de aanname in degrade.ts: alleen write+autonoom komt uit
    // gate() overeen met "mandaat stond op niveau 3". Draft is al autonoom
    // vanaf niveau 2 en degradeert hier bewust niet mee.
    const verdict = gate({ ...base, level: 2, effect: "draft" });
    expect(verdict.allow && !verdict.requiresApproval).toBe(true);
    expect(shouldDegradeOnFailure("draft", true)).toBe(false);
  });
});

describe("de voorzichtigste van een rij niveaus (mostRestrictiveLevel)", () => {
  it("kiest het laagste niveau", () => {
    expect(mostRestrictiveLevel([3, 1, 2])).toBe(1);
  });

  it("laat een gedeeld niveau staan", () => {
    expect(mostRestrictiveLevel([2, 2])).toBe(2);
  });

  it("valt zonder niveaus terug op 1", () => {
    expect(mostRestrictiveLevel([])).toBe(1);
  });
});

describe("afleiding: oude permissie → mandaat (datamigratie)", () => {
  it("vertaalt elke oude stand naar het bijbehorende niveau en de meldingsvoorkeur", () => {
    expect(deriveMandateFromPermission("propose")).toEqual({ level: 1, notify: "melden" });
    expect(deriveMandateFromPermission("draft")).toEqual({ level: 2, notify: "melden" });
    expect(deriveMandateFromPermission("act_and_report")).toEqual({ level: 3, notify: "melden" });
    expect(deriveMandateFromPermission("silent")).toEqual({ level: 3, notify: "stil" });
  });

  it("valt terug op niveau 1 bij een onherkenbare oude waarde", () => {
    expect(deriveMandateFromPermission("kapot")).toEqual({ level: 1, notify: "melden" });
    expect(deriveMandateFromPermission("")).toEqual({ level: 1, notify: "melden" });
  });

  it("laat het voorzichtigste niveau winnen bij twee connectors op hetzelfde domein", () => {
    const strak = deriveMandateFromPermission("propose"); // niveau 1
    const los = deriveMandateFromPermission("silent"); // niveau 3, stil
    expect(combineMandates(strak, los)).toEqual({ level: 1, notify: "melden" });
    expect(combineMandates(los, strak)).toEqual({ level: 1, notify: "melden" });
  });

  it("laat bij een gelijk niveau 'melden' winnen van 'stil'", () => {
    const meldend = deriveMandateFromPermission("act_and_report"); // niveau 3, melden
    const stil = deriveMandateFromPermission("silent"); // niveau 3, stil
    expect(combineMandates(meldend, stil)).toEqual({ level: 3, notify: "melden" });
    expect(combineMandates(stil, meldend)).toEqual({ level: 3, notify: "melden" });
  });

  it("laat een écht gedeeld niveau ongemoeid", () => {
    const a = deriveMandateFromPermission("draft");
    const b = deriveMandateFromPermission("draft");
    expect(combineMandates(a, b)).toEqual({ level: 2, notify: "melden" });
  });
});

describe("registry", () => {
  it("kent elke tool onder een unieke naam", () => {
    const names = toolCatalog().map((t) => t.tool.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it("gooit een herkenbare fout op een onbekende naam", () => {
    expect(() => findTool("gmail.send_now")).toThrowError(ToolError);
  });

  // CLAUDE.md, regel 5. Geen review-afspraak maar een test: wie hier een
  // verstuur-tool toevoegt, ziet het vóór de merge.
  it("heeft geen enkele mailtool die naar buiten schrijft", () => {
    expect(() => assertNoMailSending()).not.toThrow();
  });

  it("geeft de bank geen tools — die is alleen-lezen (§6.7)", () => {
    expect(toolCatalog().filter((t) => t.type === "bank")).toHaveLength(0);
  });

  it("geeft elke tool een geldig domein uit het register", () => {
    for (const { tool } of toolCatalog()) {
      expect(DOMAINS, tool.name).toContain(tool.domain);
    }
  });

  it("leidt de domeinen van een bron af uit zijn tools", () => {
    expect(domainsFor("google")).toEqual(["calendar"]);
    expect(domainsFor("gmail")).toEqual(["email_send"]);
    // Geen tools, dus geen domein — geen mandaatvraag voor een bron die
    // toch nooit iets doet (bank, CalDAV, IMAP).
    expect(domainsFor("ponto")).toEqual([]);
    expect(domainsFor("caldav")).toEqual([]);
  });
});

describe("parametervalidatie", () => {
  it("weigert een agenda-afspraak zonder geldige tijden", () => {
    const { tool } = findTool("calendar.create_event");
    expect(tool.params.safeParse({ title: "Koffie" }).success).toBe(false);
    expect(
      tool.params.safeParse({
        title: "Koffie",
        start: "2026-08-07T10:00:00+02:00",
        end: "2026-08-07T11:00:00+02:00",
      }).success,
    ).toBe(true);
  });

  it("weigert een concept-mail zonder geldig adres", () => {
    const { tool } = findTool("gmail.draft_reply");
    expect(
      tool.params.safeParse({ to: "geen adres", subject: "Hoi", body: "Tekst" }).success,
    ).toBe(false);
  });

  it("zet geen mailinhoud in de samenvatting", () => {
    const { tool } = findTool("gmail.draft_reply");
    const summary = tool.describe({
      to: "stijn@voetstepp.nl",
      subject: "Flyers",
      body: "Vertrouwelijke tekst die niemand in een melding hoort te zien.",
    });
    expect(summary).not.toContain("Vertrouwelijke");
    expect(summary).toContain("stijn@voetstepp.nl");
  });
});

describe("tokenverversing", () => {
  // De kern hoort niets van OAuth te weten; de adapter levert het token. Deze
  // test bewaakt dat de haak er blijft — zonder hem werkt een tool alleen in
  // het uur na het inloggen, en dat merk je pas als je erop rekent.
  it("laat de Google-adapters zelf een geldig token leveren", () => {
    for (const name of ["calendar.create_event", "gmail.draft_reply"]) {
      const adapter = adapterFor(findTool(name).provider);
      expect(typeof adapter?.ensureAccessToken, name).toBe("function");
    }
  });

  it("laat bronnen zonder verlopende tokens met rust", () => {
    // CalDAV en IMAP hebben een wachtwoord, geen token dat na een uur vervalt.
    for (const provider of ["caldav", "imap"] as const) {
      expect(adapterFor(provider)?.ensureAccessToken).toBeUndefined();
    }
  });

  it("vertaalt een geweigerd refresh_token naar 'opnieuw verbinden'", () => {
    const geweigerd = new ReauthRequiredError();
    expect(asToolError(geweigerd, "Agenda").code).toBe("Authentication");
    expect(asToolError(geweigerd, "Agenda").remedy).toBe("Verbind opnieuw in instellingen.");
  });

  it("ververst pas als het token bijna om is", () => {
    const now = new Date("2026-08-06T12:00:00Z");
    const ruim = new Date("2026-08-06T12:05:00Z");
    const bijna = new Date("2026-08-06T12:00:30Z");
    expect(needsRefresh(ruim, now)).toBe(false);
    expect(needsRefresh(bijna, now)).toBe(true);
    expect(needsRefresh(null, now)).toBe(true);
  });
});

describe("foutvertaling", () => {
  it("herkent een verlopen koppeling in een ruwe adapterfout", () => {
    expect(asToolError(new Error("Gmail HTTP 401"), "Gmail").code).toBe("Authentication");
    expect(asToolError(new Error("Google Calendar 429"), "Agenda").code).toBe("RateLimit");
    expect(asToolError(new Error("Google Calendar 403"), "Agenda").code).toBe("Permission");
    expect(asToolError(new Error("socket hang up"), "Agenda").code).toBe("ToolFailed");
  });

  it("laat een al vertaalde fout ongemoeid", () => {
    const original = new ToolError("Timeout", "duurde te lang");
    expect(asToolError(original, "Gmail")).toBe(original);
  });
});
