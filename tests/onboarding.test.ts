import { describe, expect, it } from "vitest";
import {
  deriveSteps,
  firstOpenStep,
  hasStartedOnboarding,
  marksFromSettings,
  markKey,
  mostRestrictiveLevel,
  nextStep,
} from "@/lib/onboarding/steps";
import {
  escalationSentence,
  formatQuietHours,
  LEVEL_HELP,
  parseQuietHours,
  ritmeSentence,
} from "@/lib/onboarding/copy";
import { LEVELS } from "@/lib/mandates/domains";
import type { TriggerDefinition } from "@/lib/escalation/triggers";

/**
 * De onboarding houdt geen stapteller bij; hij leidt af waar je bent uit wat
 * er staat. Deze tests bewaken precies dat: een gekoppelde bron is klaar, een
 * kapotte bron is nog steeds gekoppeld, en overslaan blijft overgeslagen.
 */

const geen = { connectors: [], marks: {} };

describe("waar de onboarding je heen stuurt", () => {
  it("begint bij de agenda als er nog niets is", () => {
    expect(firstOpenStep(deriveSteps(geen))).toBe("agenda");
  });

  it("slaat de agenda over zodra Google gekoppeld is", () => {
    const steps = deriveSteps({
      connectors: [{ provider: "google", status: "active" }],
      marks: {},
    });
    expect(firstOpenStep(steps)).toBe("mail");
  });

  it("rekent een inlog met Google meteen ook af met de mailstap", () => {
    // auth.ts schrijft bij "Inloggen met Google" twee rijen tegelijk weg
    // (agenda + gmail). De mailstap is dan een payoff-scherm, geen vraag.
    const steps = deriveSteps({
      connectors: [
        { provider: "google", status: "active" },
        { provider: "gmail", status: "active" },
      ],
      marks: {},
    });
    expect(firstOpenStep(steps)).toBe("bank");
  });

  it("blijft een kapotte connector als gekoppeld zien", () => {
    // Opnieuw door de onboarding sturen is het verkeerde antwoord op een
    // verlopen token — dat meldt de briefing zelf (regel 2).
    const steps = deriveSteps({
      connectors: [{ provider: "google", status: "reauth_required" }],
      marks: {},
    });
    expect(steps[0].status).toBe("connected");
    expect(firstOpenStep(steps)).toBe("mail");
  });

  it("telt een niet-gekoppelde rij niet mee", () => {
    const steps = deriveSteps({
      connectors: [{ provider: "google", status: "not_connected" }],
      marks: {},
    });
    expect(firstOpenStep(steps)).toBe("agenda");
  });

  it("komt niet terug op een stap die je bewust oversloeg", () => {
    const steps = deriveSteps({ connectors: [], marks: { agenda: "skipped" } });
    expect(steps[0].status).toBe("skipped");
    expect(firstOpenStep(steps)).toBe("mail");
  });

  it("geeft null terug als alles langs is geweest", () => {
    const steps = deriveSteps({
      connectors: [
        { provider: "google", status: "active" },
        { provider: "gmail", status: "active" },
        { provider: "ponto", status: "active" },
      ],
      marks: { meldingen: "done" },
    });
    expect(firstOpenStep(steps)).toBeNull();
  });
});

describe("de volgorde van de stappen", () => {
  it("loopt van agenda naar meldingen", () => {
    expect(nextStep("agenda")).toBe("mail");
    expect(nextStep("mail")).toBe("bank");
    expect(nextStep("bank")).toBe("meldingen");
  });

  it("heeft na de laatste stap geen volgende meer", () => {
    expect(nextStep("meldingen")).toBeNull();
  });

  it("nummert de stappen vanaf 1", () => {
    expect(deriveSteps(geen).map((s) => s.number)).toEqual([1, 2, 3, 4]);
  });
});

describe("de poort voor de eerste keer", () => {
  it("gaat dicht als er nog niets besloten is", () => {
    expect(hasStartedOnboarding(deriveSteps(geen), null)).toBe(false);
  });

  it("gaat open bij één gekoppelde bron", () => {
    const steps = deriveSteps({
      connectors: [{ provider: "google", status: "active" }],
      marks: {},
    });
    expect(hasStartedOnboarding(steps, null)).toBe(true);
  });

  it("gaat ook open als je alleen maar iets oversloeg", () => {
    // Overslaan is een antwoord. Wie de agenda bewust laat liggen, hoort niet
    // bij elk scherm teruggeduwd te worden naar dezelfde vraag.
    const steps = deriveSteps({ connectors: [], marks: { agenda: "skipped" } });
    expect(hasStartedOnboarding(steps, null)).toBe(true);
  });

  it("blijft open zodra de onboarding uitgelopen is", () => {
    expect(hasStartedOnboarding(deriveSteps(geen), new Date())).toBe(true);
  });
});

describe("de voorselectie van het mandaatniveau", () => {
  it("kiest de voorzichtigste van twee domeinen", () => {
    // Eén domein op niveau 3 ("doen"), het andere nog op niveau 1
    // ("signaleren"): wie op Volgende drukt zonder te kiezen, hoort het
    // voorzichtigste domein niet stilzwijgend ruimer te zetten.
    expect(mostRestrictiveLevel([3, 1])).toBe(1);
  });

  it("laat een gedeeld niveau staan", () => {
    expect(mostRestrictiveLevel([2, 2])).toBe(2);
  });

  it("valt zonder mandaten terug op niveau 1", () => {
    expect(mostRestrictiveLevel([])).toBe(1);
  });
});

describe("markeringen uit UserSetting", () => {
  it("leest alleen de sleutels van de onboarding", () => {
    const marks = marksFromSettings([
      { key: markKey("bank"), value: "skipped" },
      { key: markKey("meldingen"), value: "done" },
      { key: "briefing_tijd", value: "08:00" },
    ]);
    expect(marks).toEqual({ bank: "skipped", meldingen: "done" });
  });

  it("negeert een waarde die geen markering is", () => {
    expect(marksFromSettings([{ key: markKey("bank"), value: "misschien" }])).toEqual({});
  });
});

/**
 * De mandaatstap moet generiek blijven werken over DOMAIN_REGISTRY heen: het
 * domeinregister breidt uit (calendar/email_send nu, straks meer — zie
 * src/lib/mandates/domains.ts), en de uitleg per niveau mag daar niet per
 * domein voor hardgecodeerd hoeven worden. LEVEL_HELP is dus per niveau, niet
 * per domein — deze test bewaakt dat elk niveau uit LEVELS ook echt een
 * uitleg heeft, voor elk domein dat er ooit bij komt.
 */
describe("wat een mandaatniveau betekent", () => {
  it("heeft voor elk niveau een uitleg, ongeacht welk domein het is", () => {
    for (const level of LEVELS) {
      expect(LEVEL_HELP[level]).toBeTruthy();
    }
  });
});

/**
 * De meldingenstap ("wanneer stoor je me") leest het ritme en de escalaties
 * uit de bestaande registries (src/lib/runs/schedule.ts,
 * src/lib/escalation/triggers.ts) in plaats van er een eigen tekst voor te
 * verzinnen. Deze zinnen zijn puur, dus test ze zonder database.
 */
describe("het ritme in gewone taal", () => {
  it("noemt alle drie de momenten die aanstaan", () => {
    const zin = ritmeSentence([
      { kind: "morning", at: "08:00", enabled: true },
      { kind: "midday", at: "12:00", enabled: true },
      { kind: "evening", at: "20:00", enabled: true },
    ]);
    expect(zin).toContain("Ochtend om 08:00");
    expect(zin).toContain("Middag om 12:00");
    expect(zin).toContain("Avond om 20:00");
  });

  it("laat een uitgezet moment ongenoemd", () => {
    const zin = ritmeSentence([
      { kind: "morning", at: "08:00", enabled: true },
      { kind: "midday", at: "12:00", enabled: false },
      { kind: "evening", at: "20:00", enabled: true },
    ]);
    expect(zin).toContain("Ochtend om 08:00");
    expect(zin).not.toContain("Middag");
    expect(zin).toContain("Avond om 20:00");
  });

  it("zegt het eerlijk als alle momenten uitstaan", () => {
    const zin = ritmeSentence([
      { kind: "morning", at: "08:00", enabled: false },
      { kind: "midday", at: "12:00", enabled: false },
      { kind: "evening", at: "20:00", enabled: false },
    ]);
    expect(zin).toMatch(/staan nu uit/);
  });
});

describe("de escalaties in gewone taal", () => {
  const trigger = (overrides: Partial<TriggerDefinition>): TriggerDefinition => ({
    id: "deadline_24h",
    label: "Deadline binnen 24 uur",
    description: "",
    enabled: true,
    ...overrides,
  });

  it("noemt alleen de triggers die echt actief zijn", () => {
    const zin = escalationSentence([
      trigger({ id: "deadline_24h", label: "Deadline binnen 24 uur", enabled: true }),
      trigger({ id: "money_unexpected", label: "Onverwachte transactie", enabled: true }),
      trigger({ id: "children", label: "Kinderen", enabled: false }),
    ]);
    expect(zin).toContain("deadline binnen 24 uur");
    expect(zin).toContain("onverwachte transactie");
    expect(zin).not.toContain("Kinderen");
    expect(zin).not.toMatch(/kinderen/i);
  });

  it("zegt het eerlijk als er geen enkele escalatie aanstaat", () => {
    const zin = escalationSentence([trigger({ enabled: false })]);
    expect(zin).toMatch(/geen enkele escalatie/);
  });
});

describe("stille uren opbouwen en uit elkaar halen", () => {
  it("bouwt een geldig venster op uit twee tijden", () => {
    expect(formatQuietHours("22:00", "07:00")).toBe("22:00-07:00");
  });

  it("wijst een onleesbare tijd af in plaats van iets kapots op te slaan", () => {
    expect(formatQuietHours("25:00", "07:00")).toBeNull();
    expect(formatQuietHours("", "07:00")).toBeNull();
  });

  it("haalt van/tot weer uit elkaar voor de defaultValue van de velden", () => {
    expect(parseQuietHours("22:00-07:00")).toEqual({ van: "22:00", tot: "07:00" });
  });

  it("valt terug op 22:00–07:00 als er nog niets is gekozen", () => {
    expect(parseQuietHours(null)).toEqual({ van: "22:00", tot: "07:00" });
    expect(parseQuietHours(undefined)).toEqual({ van: "22:00", tot: "07:00" });
  });
});
