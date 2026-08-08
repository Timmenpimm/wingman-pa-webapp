import { describe, expect, it, vi } from "vitest";
import {
  CHILDREN_SIGNALS_SETTING_KEY,
  detectChildren,
  detectDeadline24h,
  detectHousingLongterm,
  detectMoneyUnexpected,
  HOUSING_CRITERIA_SETTING_KEY,
  TRIGGERS,
  type ChildrenSignalConfig,
  type HousingCriteria,
} from "@/lib/escalation/triggers";
import {
  planEscalations,
  processUserEscalations,
  type EscalationTx,
  type PlanInput,
} from "@/lib/escalation/engine";

/**
 * Net als tests/sync-engine.test.ts en tests/extract-commitments.test.ts:
 * een gemockte tx en een meegegeven klok, geen database nodig. De pure kern
 * (planEscalations, de detectors) staat los getest van de tx-laag eromheen.
 */

const TZ = "Europe/Amsterdam";
const NOW = new Date("2026-08-06T10:00:00Z"); // 12:00 lokaal

const basisInput: PlanInput = {
  now: NOW,
  timezone: TZ,
  quietHours: undefined,
  commitments: [],
  transactions: [],
  emails: [],
  events: [],
  childrenSignals: null,
  housingCriteria: null,
  alreadyEscalated: [],
  escalatedTodayCount: 0,
};

const KINDEREN_CONFIG: ChildrenSignalConfig = {
  contacts: ["ex-partner@voorbeeld.nl", "opvang@buurtcentrum.nl"],
  keywords: ["oscar", "cecile", "school"],
};

const WONING_CONFIG: HousingCriteria = {
  minRent: 1400,
  maxRent: 1800,
  locations: ["amsterdam", "amstelveen", "diemen"],
  minDurationMonths: 12,
};

describe("registry", () => {
  it("heeft nu vier geïmplementeerde triggers, geen placeholders meer", () => {
    const echte = TRIGGERS.filter((t) => t.enabled).map((t) => t.id);
    const placeholders = TRIGGERS.filter((t) => !t.enabled).map((t) => t.id);
    expect(echte.sort()).toEqual(["children", "deadline_24h", "housing_longterm", "money_unexpected"]);
    expect(placeholders).toEqual([]);
  });

  it("elke trigger heeft een label en omschrijving", () => {
    for (const trigger of TRIGGERS) {
      expect(trigger.label.length).toBeGreaterThan(0);
      expect(trigger.description.length).toBeGreaterThan(0);
    }
  });
});

describe("detectDeadline24h", () => {
  it("ziet een open commitment met due_date binnen 24 uur", () => {
    const in12h = new Date(NOW.getTime() + 12 * 3600_000);
    const result = detectDeadline24h(
      [{ id: "c1", status: "open", due_date: in12h }],
      NOW,
    );
    expect(result).toEqual([
      { trigger: "deadline_24h", ref_id: "c1", message: expect.any(String) },
    ]);
  });

  it("negeert een deadline verder dan 24 uur weg", () => {
    const in48h = new Date(NOW.getTime() + 48 * 3600_000);
    expect(detectDeadline24h([{ id: "c1", status: "open", due_date: in48h }], NOW)).toEqual([]);
  });

  it("negeert een deadline die al verstreken is", () => {
    const gisteren = new Date(NOW.getTime() - 3600_000);
    expect(detectDeadline24h([{ id: "c1", status: "open", due_date: gisteren }], NOW)).toEqual([]);
  });

  it("negeert een commitment zonder due_date of die niet open is", () => {
    const in12h = new Date(NOW.getTime() + 12 * 3600_000);
    expect(detectDeadline24h([{ id: "c1", status: "open", due_date: null }], NOW)).toEqual([]);
    expect(detectDeadline24h([{ id: "c2", status: "done", due_date: in12h }], NOW)).toEqual([]);
  });

  it("nooit een bedrag in de boodschap", () => {
    const in12h = new Date(NOW.getTime() + 12 * 3600_000);
    const [candidate] = detectDeadline24h([{ id: "c1", status: "open", due_date: in12h }], NOW);
    expect(candidate.message).not.toMatch(/€/);
  });
});

describe("detectMoneyUnexpected", () => {
  it("ziet een transactie die needs_review draagt", () => {
    expect(detectMoneyUnexpected([{ id: "t1", needs_review: true }])).toEqual([
      { trigger: "money_unexpected", ref_id: "t1", message: expect.any(String) },
    ]);
  });

  it("negeert een transactie die al gecategoriseerd is", () => {
    expect(detectMoneyUnexpected([{ id: "t1", needs_review: false }])).toEqual([]);
  });

  it("nooit een bedrag of schuldeisernaam in de boodschap", () => {
    const [candidate] = detectMoneyUnexpected([{ id: "t1", needs_review: true }]);
    expect(candidate.message).not.toMatch(/€|\d/);
  });

  it("de boodschap is een vaste generieke tekst — geen interpolatie van transactievelden", () => {
    const [candidate] = detectMoneyUnexpected([{ id: "t1", needs_review: true }]);
    expect(candidate.message).toBe("Er wacht een transactie op je controle.");
  });
});

describe("detectChildren", () => {
  it("ziet een mail afkomstig van een geconfigureerd contact (de ex-partner)", () => {
    const result = detectChildren(
      [
        {
          id: "e1",
          subject: "Even over het weekend",
          from_addr: "ex-partner@voorbeeld.nl",
          to_addrs: "[]",
          body_text: "",
        },
      ],
      [],
      KINDEREN_CONFIG,
    );
    expect(result).toEqual([{ trigger: "children", ref_id: "email:e1", message: expect.any(String) }]);
  });

  it("ziet een mail met een deelnemer (to_addrs) die een geconfigureerd contact is", () => {
    const result = detectChildren(
      [
        {
          id: "e2",
          subject: "Rapportbespreking",
          from_addr: "leerkracht@basisschool.nl",
          to_addrs: JSON.stringify(["opvang@buurtcentrum.nl"]),
          body_text: "",
        },
      ],
      [],
      KINDEREN_CONFIG,
    );
    expect(result).toHaveLength(1);
  });

  it("ziet een mail met een kindnaam in het onderwerp", () => {
    const result = detectChildren(
      [
        {
          id: "e3",
          subject: "Rapport Oscar groep 5",
          from_addr: "onbekend@basisschool.nl",
          to_addrs: "[]",
          body_text: "",
        },
      ],
      [],
      KINDEREN_CONFIG,
    );
    expect(result).toEqual([{ trigger: "children", ref_id: "email:e3", message: expect.any(String) }]);
  });

  it("ziet een agenda-item met de ex-partner als deelnemer — de kids-dagen", () => {
    const result = detectChildren(
      [],
      [
        {
          id: "ev1",
          title: "Overdracht",
          attendees: JSON.stringify([{ email: "ex-partner@voorbeeld.nl", name: "Ex" }]),
        },
      ],
      KINDEREN_CONFIG,
    );
    expect(result).toEqual([{ trigger: "children", ref_id: "event:ev1", message: expect.any(String) }]);
  });

  it("ziet een agenda-item met een kindnaam in de titel", () => {
    const result = detectChildren(
      [],
      [{ id: "ev2", title: "Cecile ophalen", attendees: "[]" }],
      KINDEREN_CONFIG,
    );
    expect(result).toHaveLength(1);
  });

  it("vals-positief: negeert een mail zonder match op contact of onderwerp-trefwoord, ook al gaat de tekst over kinderopvang", () => {
    const result = detectChildren(
      [
        {
          id: "e4",
          subject: "Factuur Techlab augustus",
          from_addr: "facturatie@techlab.nl",
          to_addrs: "[]",
          body_text: "Gaat over de nieuwe kinderopvangtoeslag-regeling in het algemeen, niets persoonlijks.",
        },
      ],
      [],
      KINDEREN_CONFIG,
    );
    expect(result).toEqual([]);
  });

  it("vals-positief: een deelnemer met een andere naam dan de geconfigureerde contacten matcht niet vanzelf", () => {
    const result = detectChildren(
      [],
      [
        {
          id: "ev3",
          title: "Projectoverleg",
          attendees: JSON.stringify([{ email: "oscar.jansen@extern-bedrijf.nl" }]),
        },
      ],
      KINDEREN_CONFIG,
    );
    expect(result).toEqual([]);
  });

  it("negeert alles zolang er geen configuratie is", () => {
    const result = detectChildren(
      [{ id: "e1", subject: "Oscar", from_addr: "ex-partner@voorbeeld.nl", to_addrs: "[]", body_text: "" }],
      [],
      null,
    );
    expect(result).toEqual([]);
  });

  it("nooit een naam of adres in de boodschap", () => {
    const [candidate] = detectChildren(
      [{ id: "e1", subject: "Oscar", from_addr: "ex-partner@voorbeeld.nl", to_addrs: "[]", body_text: "" }],
      [],
      KINDEREN_CONFIG,
    );
    expect(candidate.message).not.toMatch(/oscar|cecile|@/i);
  });
});

describe("detectHousingLongterm", () => {
  it("ziet een langetermijn-huurwoning binnen budget en regio (onbepaalde tijd)", () => {
    const result = detectHousingLongterm(
      [
        {
          id: "m1",
          subject: "Huuraanbod Amsterdam-West",
          from_addr: "makelaar@voorbeeld.nl",
          to_addrs: "[]",
          body_text:
            "Mooi appartement in Amsterdam-West, huurcontract voor onbepaalde tijd, huur €1.550 per maand.",
        },
      ],
      WONING_CONFIG,
    );
    expect(result).toEqual([{ trigger: "housing_longterm", ref_id: "m1", message: expect.any(String) }]);
  });

  it("ziet een woning met een genoemde contractduur van precies de minimumgrens", () => {
    const result = detectHousingLongterm(
      [
        {
          id: "m2",
          subject: "Huuraanbod",
          from_addr: "makelaar@voorbeeld.nl",
          to_addrs: "[]",
          body_text: "Amstelveen, huurcontract voor 12 maanden, €1.450 p/m.",
        },
      ],
      WONING_CONFIG,
    );
    expect(result).toHaveLength(1);
  });

  it("vals-positief: filtert short-stay eruit, ook als de rest van de criteria klopt", () => {
    const result = detectHousingLongterm(
      [
        {
          id: "m3",
          subject: "Short stay appartement Amsterdam",
          from_addr: "makelaar@voorbeeld.nl",
          to_addrs: "[]",
          body_text: "Short stay appartement in Amsterdam, contract voor onbepaalde tijd, €1.500 per maand.",
        },
      ],
      WONING_CONFIG,
    );
    expect(result).toEqual([]);
  });

  it("vals-positief: filtert tussenhuur en woningruil eruit", () => {
    const tussenhuur = detectHousingLongterm(
      [
        {
          id: "m4",
          subject: "Tussenhuur Amsterdam",
          from_addr: "x",
          to_addrs: "[]",
          body_text: "Tussenhuur in Amsterdam, onbepaalde tijd, €1.500 per maand.",
        },
      ],
      WONING_CONFIG,
    );
    const woningruil = detectHousingLongterm(
      [
        {
          id: "m5",
          subject: "Woningruil gezocht",
          from_addr: "x",
          to_addrs: "[]",
          body_text: "Woningruil in Amsterdam, onbepaalde tijd, €1.500 per maand.",
        },
      ],
      WONING_CONFIG,
    );
    expect(tussenhuur).toEqual([]);
    expect(woningruil).toEqual([]);
  });

  it("vals-positief: negeert een te korte contractduur", () => {
    const result = detectHousingLongterm(
      [
        {
          id: "m6",
          subject: "Huuraanbod",
          from_addr: "x",
          to_addrs: "[]",
          body_text: "Amsterdam, huurcontract voor 6 maanden, €1.500 per maand.",
        },
      ],
      WONING_CONFIG,
    );
    expect(result).toEqual([]);
  });

  it("vals-positief: negeert een huurprijs buiten de prijsklasse", () => {
    const result = detectHousingLongterm(
      [
        {
          id: "m7",
          subject: "Huuraanbod",
          from_addr: "x",
          to_addrs: "[]",
          body_text: "Amsterdam, huurcontract onbepaalde tijd, huur €2.200 per maand.",
        },
      ],
      WONING_CONFIG,
    );
    expect(result).toEqual([]);
  });

  it("vals-positief: negeert een woning buiten de geconfigureerde regio", () => {
    const result = detectHousingLongterm(
      [
        {
          id: "m8",
          subject: "Huuraanbod",
          from_addr: "x",
          to_addrs: "[]",
          body_text: "Rotterdam, huurcontract onbepaalde tijd, huur €1.500 per maand.",
        },
      ],
      WONING_CONFIG,
    );
    expect(result).toEqual([]);
  });

  it("negeert alles zolang er geen configuratie is", () => {
    const result = detectHousingLongterm(
      [
        {
          id: "m1",
          subject: "Huuraanbod",
          from_addr: "x",
          to_addrs: "[]",
          body_text: "Amsterdam, onbepaalde tijd, €1.500 per maand.",
        },
      ],
      null,
    );
    expect(result).toEqual([]);
  });

  it("nooit een bedrag in de boodschap", () => {
    const [candidate] = detectHousingLongterm(
      [
        {
          id: "m1",
          subject: "Huuraanbod",
          from_addr: "x",
          to_addrs: "[]",
          body_text: "Amsterdam, onbepaalde tijd, €1.500 per maand.",
        },
      ],
      WONING_CONFIG,
    );
    expect(candidate.message).not.toMatch(/€|\d/);
  });
});

describe("planEscalations — dagcap", () => {
  it("laat maximaal twee kandidaten door, ook als er meer kandidaten zijn", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [
        { id: "c1", status: "open", due_date: in1h },
        { id: "c2", status: "open", due_date: in1h },
      ],
      transactions: [{ id: "t1", needs_review: true }],
    });
    expect(plan.toEscalate).toHaveLength(2);
  });

  it("houdt rekening met wat er vandaag al geëscaleerd is", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
      transactions: [{ id: "t1", needs_review: true }],
      escalatedTodayCount: 1,
    });
    expect(plan.toEscalate).toHaveLength(1);
  });

  it("laat niets meer door zodra de dagcap al vol is", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
      escalatedTodayCount: 2,
    });
    expect(plan.toEscalate).toEqual([]);
  });

  it("kinderen en langetermijn-wonen gaan voor op deadline/geld bij een volle dagcap", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
      transactions: [{ id: "t1", needs_review: true }],
      emails: [
        { id: "e1", subject: "Oscar", from_addr: "ex-partner@voorbeeld.nl", to_addrs: "[]", body_text: "" },
        {
          id: "e2",
          subject: "Huuraanbod",
          from_addr: "x",
          to_addrs: "[]",
          body_text: "Amsterdam, onbepaalde tijd, €1.500 per maand.",
        },
      ],
      childrenSignals: KINDEREN_CONFIG,
      housingCriteria: WONING_CONFIG,
    });
    expect(plan.toEscalate.map((c) => c.trigger)).toEqual(["children", "housing_longterm"]);
  });
});

describe("planEscalations — dedupe", () => {
  it("escaleert een ref_id niet nog een keer voor dezelfde trigger", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
      alreadyEscalated: [{ trigger: "deadline_24h", ref_id: "c1" }],
    });
    expect(plan.toEscalate).toEqual([]);
  });

  it("dedupe geldt per trigger — dezelfde ref_id onder een andere trigger blijft kandidaat", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      commitments: [{ id: "x1", status: "open", due_date: in1h }],
      alreadyEscalated: [{ trigger: "money_unexpected", ref_id: "x1" }],
    });
    expect(plan.toEscalate).toEqual([
      { trigger: "deadline_24h", ref_id: "x1", message: expect.any(String) },
    ]);
  });
});

describe("planEscalations — stille uren", () => {
  it("escaleert niets binnen het venster en zegt dat het is uitgesteld", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    // 12:00 lokaal ligt binnen 10:00-14:00.
    const plan = planEscalations({
      ...basisInput,
      quietHours: "10:00-14:00",
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
    });
    expect(plan).toEqual({ deferredQuietHours: true, toEscalate: [] });
  });

  it("escaleert gewoon buiten het venster", () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const plan = planEscalations({
      ...basisInput,
      quietHours: "22:00-08:00",
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
    });
    expect(plan.deferredQuietHours).toBe(false);
    expect(plan.toEscalate).toHaveLength(1);
  });
});

function fakeTx(overrides: {
  quietHours?: string;
  commitments?: Array<{ id: string; status: string; due_date: Date | null }>;
  transactions?: Array<{ id: string; needs_review: boolean }>;
  emails?: Array<{ id: string; subject: string; from_addr: string; to_addrs: string; body_text: string }>;
  events?: Array<{ id: string; title: string; attendees: string }>;
  /** Ruwe UserSetting.value voor "escalation_children_signals" — al gestringify'd JSON, net als in de database. */
  childrenSignals?: string;
  /** Ruwe UserSetting.value voor "escalation_housing_criteria". */
  housingCriteria?: string;
  existingEvents?: Array<{ trigger: string; ref_id: string; created_at: Date }>;
  createImpl?: ReturnType<typeof vi.fn>;
}): EscalationTx & { escalationEvent: { create: ReturnType<typeof vi.fn> } } {
  // Eén findUnique-mock die op de gevraagde `key` routeert — met drie
  // instellingensleutels (quiet_hours + de twee nieuwe) kan een enkele
  // vaste return value niet meer, in tegenstelling tot toen er maar één
  // instelling was.
  const settingsByKey: Record<string, string | undefined> = {
    quiet_hours: overrides.quietHours,
    [CHILDREN_SIGNALS_SETTING_KEY]: overrides.childrenSignals,
    [HOUSING_CRITERIA_SETTING_KEY]: overrides.housingCriteria,
  };

  return {
    userSetting: {
      findUnique: vi
        .fn()
        .mockImplementation(async ({ where }: { where: { user_id_key: { key: string } } }) => {
          const value = settingsByKey[where.user_id_key.key];
          return value !== undefined ? { value } : null;
        }),
    },
    commitment: { findMany: vi.fn().mockResolvedValue(overrides.commitments ?? []) },
    transaction: { findMany: vi.fn().mockResolvedValue(overrides.transactions ?? []) },
    email: { findMany: vi.fn().mockResolvedValue(overrides.emails ?? []) },
    event: { findMany: vi.fn().mockResolvedValue(overrides.events ?? []) },
    escalationEvent: {
      findMany: vi.fn().mockResolvedValue(overrides.existingEvents ?? []),
      create: overrides.createImpl ?? vi.fn().mockResolvedValue({}),
    },
  };
}

describe("processUserEscalations — de onzuivere laag", () => {
  it("schrijft een EscalationEvent weg per gekozen kandidaat", async () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const tx = fakeTx({ commitments: [{ id: "c1", status: "open", due_date: in1h }] });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    expect(created).toHaveLength(1);
    expect(tx.escalationEvent.create).toHaveBeenCalledWith({
      data: { user_id: "user_1", trigger: "deadline_24h", ref_id: "c1", message: expect.any(String) },
    });
  });

  it("telt escalatedTodayCount uit created_at in de tijdzone van de gebruiker, niet in UTC", async () => {
    // 23:30 UTC op 5 augustus is 01:30 op 6 augustus in Amsterdam (zomertijd) —
    // dus "vandaag" (6 augustus lokaal) al één escalatie, ook al staat de
    // created_at-timestamp nog op 5 augustus in UTC.
    const gisterenAvondUtc = new Date("2026-08-05T23:30:00Z");
    const in1h = new Date(NOW.getTime() + 3600_000);
    const tx = fakeTx({
      commitments: [
        { id: "c1", status: "open", due_date: in1h },
        { id: "c2", status: "open", due_date: in1h },
      ],
      existingEvents: [
        { trigger: "deadline_24h", ref_id: "oud", created_at: gisterenAvondUtc },
      ],
    });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    // Cap is 2, er stond al 1 vandaag (lokaal), dus nog maar 1 slot over.
    expect(created).toHaveLength(1);
  });

  it("slaat een unieke-sleutelbotsing bij het schrijven stil over", async () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const create = vi.fn().mockRejectedValue(new Error("unique constraint"));
    const tx = fakeTx({
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
      createImpl: create,
    });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    expect(created).toEqual([]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("doet niets en schrijft niets tijdens stille uren", async () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const tx = fakeTx({
      quietHours: "10:00-14:00", // NOW is 12:00 lokaal
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
    });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    expect(created).toEqual([]);
    expect(tx.escalationEvent.create).not.toHaveBeenCalled();
  });

  it("schrijft een EscalationEvent weg voor een mail die met de kinderen te maken heeft", async () => {
    const tx = fakeTx({
      emails: [
        { id: "e1", subject: "Oscar naar de tandarts", from_addr: "x@y.nl", to_addrs: "[]", body_text: "" },
      ],
      childrenSignals: JSON.stringify({ contacts: [], keywords: ["oscar"] }),
    });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    expect(created).toEqual([{ trigger: "children", ref_id: "email:e1", message: expect.any(String) }]);
  });

  it("schrijft een EscalationEvent weg voor een langetermijn-woningkans", async () => {
    const tx = fakeTx({
      emails: [
        {
          id: "m1",
          subject: "Huuraanbod",
          from_addr: "makelaar@voorbeeld.nl",
          to_addrs: "[]",
          body_text: "Amsterdam, huurcontract onbepaalde tijd, €1.500 per maand.",
        },
      ],
      housingCriteria: JSON.stringify({
        minRent: 1400,
        maxRent: 1800,
        locations: ["amsterdam"],
        minDurationMonths: 12,
      }),
    });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    expect(created).toEqual([{ trigger: "housing_longterm", ref_id: "m1", message: expect.any(String) }]);
  });

  it("respecteert de dagcap ook als kinderen/wonen op dezelfde tick vallen als deadline/geld", async () => {
    const in1h = new Date(NOW.getTime() + 3600_000);
    const tx = fakeTx({
      commitments: [{ id: "c1", status: "open", due_date: in1h }],
      transactions: [{ id: "t1", needs_review: true }],
      emails: [{ id: "e1", subject: "Oscar", from_addr: "x", to_addrs: "[]", body_text: "" }],
      childrenSignals: JSON.stringify({ contacts: [], keywords: ["oscar"] }),
    });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    // Cap blijft 2, ook met vier kandidaten — en de kinderen-trigger wint een
    // slot van deadline/geld (zie "planEscalations — dagcap" hierboven).
    expect(created).toHaveLength(2);
    expect(created.map((c) => c.trigger)).toContain("children");
  });

  it("doet niets voor kinderen of wonen zolang er geen configuratie voor die gebruiker staat", async () => {
    const tx = fakeTx({
      emails: [
        {
          id: "e1",
          subject: "Oscar",
          from_addr: "ex-partner@voorbeeld.nl",
          to_addrs: "[]",
          body_text: "Amsterdam onbepaalde tijd 1500 euro per maand",
        },
      ],
    });

    const created = await processUserEscalations(tx, "user_1", TZ, NOW);

    expect(created).toEqual([]);
  });
});
