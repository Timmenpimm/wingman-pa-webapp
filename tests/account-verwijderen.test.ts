import { describe, expect, it, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Account verwijderen (src/lib/actions.ts, deleteAccount()) doet één ding:
 * de User-rij weggooien. De rest moet meekomen via ON DELETE CASCADE — dat
 * gat viel al eens eerder (zie rls-dekking.test.ts): GraphNode en GraphEdge
 * kregen bij hun aanmaak geen foreign key naar User, in tegenstelling tot
 * elke andere tabel met een user_id-kolom. Ze stonden dus wél achter RLS,
 * maar zouden als wees zijn blijven staan na een verwijderd account.
 *
 * Deze test vraagt het aan de database zelf, net als rls-dekking.test.ts:
 * elke tabel met een user_id-kolom moet een foreign key naar User(id) hebben
 * met delete_rule = CASCADE. Een nieuwe tabel zonder die constraint laat hem
 * meteen falen, in plaats van pas op te vallen als iemand zijn account
 * verwijdert en de rijen ergens blijven hangen.
 *
 * Zonder DIRECT_URL (bijvoorbeeld hier, zonder lokale Postgres) slaat hij
 * zichzelf over: liever overgeslagen dan groen om de verkeerde reden.
 */

const url = process.env.DIRECT_URL;
const prisma = url ? new PrismaClient({ datasourceUrl: url }) : null;

afterAll(async () => {
  await prisma?.$disconnect();
});

describe.skipIf(!url)("elke gebruikerstabel cascadet naar User", () => {
  it("elke tabel met user_id heeft een foreign key naar User(id) met ON DELETE CASCADE", async () => {
    const tabellenMetUserId = await prisma!.$queryRawUnsafe<Array<{ tabel: string }>>(
      `select c.relname as tabel
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

    expect(tabellenMetUserId.length).toBeGreaterThan(5); // anders vraagt de query het verkeerde

    const cascades = await prisma!.$queryRawUnsafe<
      Array<{ tabel: string; delete_rule: string }>
    >(
      `select tc.table_name as tabel, rc.delete_rule
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
         join information_schema.referential_constraints rc
           on tc.constraint_name = rc.constraint_name and tc.table_schema = rc.constraint_schema
         join information_schema.constraint_column_usage ccu
           on rc.unique_constraint_name = ccu.constraint_name
          and rc.unique_constraint_schema = ccu.constraint_schema
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_schema = 'public'
          and kcu.column_name = 'user_id'
          and ccu.table_name = 'User'`,
    );

    const gaten = tabellenMetUserId
      .filter((t) => {
        const constraint = cascades.find((c) => c.tabel === t.tabel);
        return !constraint || constraint.delete_rule !== "CASCADE";
      })
      .map((t) => t.tabel);

    expect(gaten, `Tabellen zonder cascade naar User: ${gaten.join(", ")}`).toEqual([]);
  });
});
