import { beforeEach, describe, expect, it, vi } from "vitest";
import { RUN_DEFAULTS } from "@/lib/runs/schedule";
import { findOrCreateUserByEmail } from "@/lib/auth/google-connectors";

/**
 * Een nieuwe gebruiker moet zijn drie momenten meekrijgen.
 *
 * Dit was een echt gat: RUN_DEFAULTS werd alleen door prisma/seed.ts
 * weggeschreven, dus voor testgebruikers. Wie zich met een inloglink of via
 * Google registreerde kreeg nul ScheduledRun-rijen, en dan vindt de tick in
 * src/lib/runs/execute.ts eeuwig niets — geen briefing, ooit. Het "klaar"-
 * scherm beloofde ondertussen wél "Om 08:00 lees ik je bronnen".
 *
 * De belofte hoort dus bij het aanmaken van de User te staan, niet bij de
 * seed. Deze test bewaakt de bedrading en draait altijd; de rijen zelf
 * (inclusief de defaults die alleen het schema kent) worden tegen een echte
 * Postgres gecontroleerd in registratie-momenten-db.test.ts.
 */

const NIEUWE_USER = { id: "u_nieuw", email: "nieuw@example.com", name: null };

interface CreateManyArgs {
  data: Array<{ user_id: string; kind: string; at: string }>;
  skipDuplicates?: boolean;
}

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(async (_args: unknown) => ({
    id: "u_nieuw",
    email: "nieuw@example.com",
    name: null as string | null,
  })),
  createMany: vi.fn(async (_args: CreateManyArgs) => ({ count: 3 })),
}));

vi.mock("@/lib/db/owner-prisma", () => ({
  ownerPrisma: {
    user: { upsert: mocks.upsert },
    scheduledRun: { createMany: mocks.createMany },
  },
}));

// upsertGoogleConnectors staat in hetzelfde bestand en trekt de gewone
// app-client binnen; die heeft in deze test niets te zoeken.
vi.mock("@/lib/db/with-user", () => ({ withUser: vi.fn() }));

describe("registreren levert de drie momenten op", () => {
  beforeEach(() => {
    mocks.upsert.mockClear();
    mocks.createMany.mockClear();
  });

  it("schrijft ochtend, middag en avond weg bij de User die net ontstond", async () => {
    const user = await findOrCreateUserByEmail(NIEUWE_USER.email);

    expect(user.id).toBe(NIEUWE_USER.id);
    expect(mocks.createMany).toHaveBeenCalledTimes(1);

    const [argument] = mocks.createMany.mock.calls[0];
    expect(argument.data).toEqual(
      RUN_DEFAULTS.map((run) => ({ user_id: NIEUWE_USER.id, kind: run.kind, at: run.at })),
    );
    // En expliciet uitgeschreven: dit zijn de tijden die het "klaar"-scherm
    // en de ritmestap beloven.
    expect(argument.data.map((r) => `${r.kind} ${r.at}`)).toEqual([
      "morning 08:00",
      "midday 12:00",
      "evening 20:00",
    ]);
  });

  it("laat bestaande momenten met rust, ook als je opnieuw inlogt", async () => {
    await findOrCreateUserByEmail(NIEUWE_USER.email);

    // @@unique([user_id, kind]) plus skipDuplicates: opnieuw inloggen mag
    // nooit een tweede set opleveren, en mag een verzet tijdstip nooit
    // terugzetten naar 08:00. Zonder deze vlag zou dezelfde aanroep bij de
    // tweede login op de unique-constraint klappen en het inloggen breken.
    const [argument] = mocks.createMany.mock.calls[0];
    expect(argument.skipDuplicates).toBe(true);
  });
});
