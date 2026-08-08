import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { RUN_DEFAULTS, RUN_KINDS } from "@/lib/runs/schedule";

/**
 * Hetzelfde als registratie-momenten.test.ts, maar aan de database gevraagd:
 * bestaan de rijen echt, staan ze aan, en levert een tweede login er geen
 * tweede set op? Dat laatste kan alleen Postgres beantwoorden — het hangt aan
 * @@unique([user_id, kind]) en skipDuplicates, niet aan code die je kunt
 * naspelen met een dubbel.
 *
 * Los bestand omdat het de echte modules nodig heeft: registratie-momenten.
 * test.ts vervangt ownerPrisma door een dubbel, en dat werkt per bestand.
 *
 * Zonder DIRECT_URL slaat hij zichzelf over, net als account-verwijderen.
 * test.ts en rls-dekking.test.ts: liever overgeslagen dan groen om de
 * verkeerde reden. Lokaal aanzetten met `npm run db:up` en een .env.
 */

const url = process.env.DIRECT_URL;
const db = url ? new PrismaClient({ datasourceUrl: url }) : null;
const proefEmail = "registratie-momenten-test@example.invalid";

afterAll(async () => {
  if (!db) return;
  await db.user.deleteMany({ where: { email: proefEmail } });
  await db.$disconnect();
});

describe.skipIf(!url)("registreren tegen een echte database", () => {
  it("levert drie ingeschakelde momenten op de beloofde tijden op", async () => {
    // Dynamisch: ownerPrisma bouwt zich op DIRECT_URL, en dat bestaat alleen
    // in de tak waar deze test ook echt draait.
    const { findOrCreateUserByEmail } = await import("@/lib/auth/google-connectors");

    await db!.user.deleteMany({ where: { email: proefEmail } });

    const user = await findOrCreateUserByEmail(proefEmail);
    const runs = await db!.scheduledRun.findMany({
      where: { user_id: user.id },
      select: { kind: true, at: true, enabled: true },
    });

    expect(runs).toHaveLength(RUN_KINDS.length);
    expect(runs.every((run) => run.enabled)).toBe(true);
    expect(runs.map((run) => `${run.kind} ${run.at}`).sort()).toEqual(
      RUN_DEFAULTS.map((run) => `${run.kind} ${run.at}`).sort(),
    );
  });

  it("voegt bij een tweede login niets toe en verzet niets terug", async () => {
    const { findOrCreateUserByEmail } = await import("@/lib/auth/google-connectors");

    const user = await findOrCreateUserByEmail(proefEmail);
    // Een verzet tijdstip is precies wat een tweede login niet mag aanraken.
    await db!.scheduledRun.updateMany({
      where: { user_id: user.id, kind: "morning" },
      data: { at: "06:30" },
    });

    const opnieuw = await findOrCreateUserByEmail(proefEmail);
    expect(opnieuw.id).toBe(user.id);

    const runs = await db!.scheduledRun.findMany({
      where: { user_id: user.id },
      select: { kind: true, at: true },
    });
    expect(runs).toHaveLength(RUN_KINDS.length);
    expect(runs.find((run) => run.kind === "morning")?.at).toBe("06:30");
  });
});
