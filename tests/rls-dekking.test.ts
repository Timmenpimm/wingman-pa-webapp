import { describe, expect, it, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Elke tabel met een `user_id` moet afgeschermd zijn.
 *
 * Dit gat is één keer echt gevallen: `ScheduledRun` en `RunLog` werden ná de
 * RLS-migratie aangemaakt. Rechten erven mee via ALTER DEFAULT PRIVILEGES,
 * maar RLS aanzetten en een beleid schrijven niet — dus stonden ze open
 * terwijl alle andere tabellen dicht zaten, en niets in de app merkte dat.
 *
 * Deze test vraagt het aan de database zelf in plaats van aan een lijst die
 * iemand moet bijwerken. Een nieuwe tabel zonder beleid laat hem meteen falen.
 *
 * Zonder DIRECT_URL (bijvoorbeeld in CI zonder database) slaat hij zichzelf
 * over: liever overgeslagen dan groen om de verkeerde reden.
 */

const url = process.env.DIRECT_URL;
const prisma = url ? new PrismaClient({ datasourceUrl: url }) : null;

afterAll(async () => {
  await prisma?.$disconnect();
});

describe.skipIf(!url)("row-level security dekt alle gebruikerstabellen", () => {
  it("elke tabel met user_id heeft RLS, FORCE en een beleid", async () => {
    const rijen = await prisma!.$queryRawUnsafe<
      Array<{ tabel: string; rls: boolean; force: boolean; beleid: bigint }>
    >(
      `select c.relname as tabel,
              c.relrowsecurity as rls,
              c.relforcerowsecurity as force,
              (select count(*) from pg_policies p where p.tablename = c.relname) as beleid
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and exists (
            select 1 from information_schema.columns col
             where col.table_name = c.relname
               and col.column_name = 'user_id'
          )`,
    );

    expect(rijen.length).toBeGreaterThan(5); // anders vraagt de query het verkeerde

    const gaten = rijen
      .filter((r) => !r.rls || !r.force || Number(r.beleid) === 0)
      .map((r) => `${r.tabel} (rls: ${r.rls}, force: ${r.force}, beleid: ${r.beleid})`);

    expect(gaten, `Tabellen zonder afscherming: ${gaten.join(", ")}`).toEqual([]);
  });

  it("de User-tabel is ook afgeschermd, op id in plaats van user_id", async () => {
    const [rij] = await prisma!.$queryRawUnsafe<Array<{ rls: boolean; force: boolean }>>(
      `select relrowsecurity as rls, relforcerowsecurity as force
         from pg_class where relname = 'User'`,
    );
    expect(rij?.rls).toBe(true);
    expect(rij?.force).toBe(true);
  });

  it("app_user mag geen RLS omzeilen", async () => {
    const [rij] = await prisma!.$queryRawUnsafe<Array<{ rolbypassrls: boolean }>>(
      `select rolbypassrls from pg_roles where rolname = 'app_user'`,
    );
    // Een rol met BYPASSRLS maakt al het beleid hierboven betekenisloos.
    expect(rij?.rolbypassrls).toBe(false);
  });
});
