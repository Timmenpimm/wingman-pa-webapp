import { describe, expect, it } from "vitest";
import {
  deriveSteps,
  firstOpenStep,
  hasStartedOnboarding,
  marksFromSettings,
  markKey,
  mostRestrictive,
  nextStep,
} from "@/lib/onboarding/steps";

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

describe("de voorselectie van de permissie", () => {
  it("kiest de voorzichtigste van twee agenda's", () => {
    // Werkagenda op "doen en melden", privéagenda op "voorstellen": wie op
    // Volgende drukt zonder te kiezen, hoort de privéagenda niet stilzwijgend
    // ruimer te zetten.
    expect(mostRestrictive(["act_and_report", "propose"])).toBe("propose");
  });

  it("laat een gedeelde stand staan", () => {
    expect(mostRestrictive(["draft", "draft"])).toBe("draft");
  });

  it("valt zonder connectors terug op voorstellen", () => {
    expect(mostRestrictive([])).toBe("propose");
  });

  it("negeert een waarde die geen permissie is", () => {
    expect(mostRestrictive(["silent", "kapot"])).toBe("silent");
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
