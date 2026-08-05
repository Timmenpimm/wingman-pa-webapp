import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Zet de RLS-context voor precies één transactie en voert `fn` daarbinnen uit.
 *
 * De databaserol waarmee de app draait (app_user) heeft geen BYPASSRLS: elke
 * tabel met user_id filtert op `current_setting('app.user_id', true)` (zie de
 * migratie in prisma/migrations/*_enable_rls). Die sessievariabele bestaat
 * niet vanzelf — iets moet 'm zetten, en dat gebeurt hier.
 *
 * `set_config('app.user_id', userId, true)` — die laatste `true` is LOCAL:
 * de waarde geldt alleen binnen de transactie waarin hij gezet is en verdwijnt
 * zodra die commit of rollbackt. Dat is precies wat je wilt op de transaction
 * pooler (poort 6543, DATABASE_URL): daar wordt de onderliggende verbinding
 * tussen transacties hergebruikt voor andere requests. Zónder LOCAL (dus met
 * SESSION-scope) zou de user_id van de vorige request kunnen blijven hangen
 * op een hergebruikte verbinding — precies het lek dat RLS moet voorkomen.
 *
 * De parameter gaat als bind-parameter mee ($executeRaw met een tagged
 * template, geen string-concatenatie), dus dit is niet vatbaar voor SQL-
 * injectie via userId.
 */
export type Tx = Prisma.TransactionClient;

export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  });
}
