import { describe, expect, it } from "vitest";
import {
  eersteVrijeSlot,
  heeftBlokVoor,
  MAX_PROPOSALS_PER_DAY,
  planProposals,
  type ProposalInput,
} from "@/brain/propose";

/**
 * De voorstelmotor draait elke vijftien minuten, dus elke fout hier is er een
 * die zich zesennegentig keer per dag herhaalt. Twee dingen worden daarom het
 * strengst getest: dat er niet twee keer hetzelfde voorgesteld wordt, en dat
 * een blok nooit bovenop iets valt dat er al staat.
 */

const TZ = "Europe/Amsterdam";
/** 06:00 UTC = 08:00 in Amsterdam (zomertijd) — vóór werktijd. */
const OCHTEND = new Date("2026-08-10T06:00:00Z");

const basis: ProposalInput = {
  localDate: "2026-08-10",
  timezone: TZ,
  now: OCHTEND,
  frog: { title: "Schuldhulp Ede bellen", status: "open" },
  events: [],
  commitments: [],
  usedDedupeKeys: new Set(),
  proposalsToday: 0,
};

describe("het frog-blok", () => {
  it("zet een blok op het eerste werkuur als de agenda leeg is", () => {
    const [voorstel] = planProposals(basis);

    expect(voorstel.tool).toBe("calendar.create_event");
    expect(voorstel.dedupeKey).toBe("frog-block:2026-08-10");
    // 09:00 in Amsterdam = 07:00 UTC.
    expect(voorstel.params.start).toBe("2026-08-10T07:00:00.000Z");
    expect(voorstel.params.end).toBe("2026-08-10T07:45:00.000Z");
    expect(voorstel.params.title).toBe("Schuldhulp Ede bellen");
  });

  it("stelt niets voor zonder briefing", () => {
    expect(planProposals({ ...basis, frog: null })).toEqual([]);
  });

  it("stelt niets voor als de frog al afgevinkt is", () => {
    expect(planProposals({ ...basis, frog: { ...basis.frog!, status: "done" } })).toEqual([]);
  });

  it("schuift langs een bestaande afspraak heen", () => {
    const voorstellen = planProposals({
      ...basis,
      events: [
        {
          title: "Standup",
          start_at: new Date("2026-08-10T07:00:00Z"), // 09:00 lokaal
          end_at: new Date("2026-08-10T07:30:00Z"),
        },
      ],
    });

    // Eerste kwartier ná de standup waarop 45 minuten vrij zijn: 09:30 lokaal.
    expect(voorstellen[0].params.start).toBe("2026-08-10T07:30:00.000Z");
  });

  it("stelt niets voor als de dag vol staat", () => {
    const vol = planProposals({
      ...basis,
      events: [
        {
          title: "Retraite",
          start_at: new Date("2026-08-10T06:00:00Z"),
          end_at: new Date("2026-08-10T17:00:00Z"),
        },
      ],
    });
    expect(vol).toEqual([]);
  });

  it("kiest nooit een tijd in het verleden", () => {
    // 13:10 UTC = 15:10 lokaal; het eerstvolgende kwartier is 15:15.
    const slot = eersteVrijeSlot({
      ...basis,
      now: new Date("2026-08-10T13:10:00Z"),
    });
    expect(slot?.start.toISOString()).toBe("2026-08-10T13:15:00.000Z");
  });

  it("herkent een blok dat de gebruiker zelf al zette", () => {
    expect(
      heeftBlokVoor("Schuldhulp Ede bellen", [
        { title: "bellen: schuldhulp Ede", start_at: OCHTEND, end_at: null },
      ]),
    ).toBe(true);

    expect(
      heeftBlokVoor("Schuldhulp Ede bellen", [
        { title: "Tandarts", start_at: OCHTEND, end_at: null },
      ]),
    ).toBe(false);
  });
});

describe("het concept-antwoord", () => {
  const belofte = {
    id: "c1",
    what: "offerte nakijken",
    party: "Stijn",
    party_contact: "info@voetstepp.nl",
    source: "email",
    opened_at: new Date("2026-07-25T09:00:00Z"),
  };

  it("zet een concept klaar voor de oudste mailbelofte", () => {
    const voorstellen = planProposals({ ...basis, frog: null, commitments: [belofte] });

    expect(voorstellen).toHaveLength(1);
    expect(voorstellen[0].tool).toBe("gmail.draft_reply");
    expect(voorstellen[0].dedupeKey).toBe("reply-draft:c1");
    expect(voorstellen[0].params.to).toBe("info@voetstepp.nl");
  });

  it("slaat een belofte zonder e-mailadres over", () => {
    const zonderAdres = { ...belofte, party_contact: null };
    expect(planProposals({ ...basis, frog: null, commitments: [zonderAdres] })).toEqual([]);
  });

  it("slaat een belofte over die niet uit mail komt", () => {
    const uitAgenda = { ...belofte, source: "calendar" };
    expect(planProposals({ ...basis, frog: null, commitments: [uitAgenda] })).toEqual([]);
  });

  it("houdt de aanhef leeg en zegt niets namens de gebruiker", () => {
    const [voorstel] = planProposals({ ...basis, frog: null, commitments: [belofte] });
    const body = voorstel.params.body as string;

    expect(body).toContain("offerte nakijken");
    // Geen excuus en geen termijn die de gebruiker niet heeft toegezegd.
    expect(body).not.toMatch(/excuus|excuses|sorry|morgen|deze week/i);
    // De alinea-indeling moet overleven: clamp() plet witruimte en mag hier dus
    // niet over het geheel gaan.
    expect(body.split("\n").length).toBeGreaterThan(3);
  });
});

describe("niet twee keer hetzelfde", () => {
  it("slaat een sleutel over die al gebruikt is", () => {
    const alGedaan = planProposals({
      ...basis,
      usedDedupeKeys: new Set(["frog-block:2026-08-10"]),
    });
    expect(alGedaan).toEqual([]);
  });

  it("houdt zich aan de dagcap", () => {
    expect(planProposals({ ...basis, proposalsToday: MAX_PROPOSALS_PER_DAY })).toEqual([]);
  });

  it("levert nooit meer voorstellen dan er ruimte is", () => {
    const veelBeloftes = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      what: `belofte ${i}`,
      party: "Stijn",
      party_contact: "info@voetstepp.nl",
      source: "email",
      opened_at: new Date("2026-07-25T09:00:00Z"),
    }));

    const voorstellen = planProposals({
      ...basis,
      commitments: veelBeloftes,
      proposalsToday: MAX_PROPOSALS_PER_DAY - 1,
    });

    expect(voorstellen).toHaveLength(1);
    // Het agendablok gaat vóór de concepten: een frog zonder tijd is de reden
    // dat hij morgen weer de frog is.
    expect(voorstellen[0].tool).toBe("calendar.create_event");
  });
});
