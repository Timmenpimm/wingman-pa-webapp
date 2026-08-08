import { ownerPrisma } from "@/lib/db/owner-prisma";
import { RUN_DEFAULTS } from "./schedule";

/**
 * Zet de drie momenten klaar voor een gebruiker.
 *
 * Hoort bij het ontstaan van de User, niet bij de seed. Zonder deze rijen
 * vindt de tick (src/lib/runs/execute.ts) niets om te draaien en krijgt een
 * echte nieuwe gebruiker nooit een briefing — terwijl het "klaar"-scherm en
 * de ritmestap wél "om 08:00" beloven. Dat gat bestond: RUN_DEFAULTS werd
 * alleen door prisma/seed.ts weggeschreven.
 *
 * Via ownerPrisma, niet via withUser(): dit draait in het inlogpad, vóórdat
 * er een sessie is om `app.user_id` mee te zetten. Zie de toelichting in
 * src/lib/db/owner-prisma.ts voor waarom dat geen gat in de RLS is.
 *
 * `skipDuplicates` in plaats van een "is dit een nieuwe gebruiker"-vraag:
 * @@unique([user_id, kind]) maakt het onmogelijk om per ongeluk een tweede
 * set te schrijven, dus mag dit onvoorwaardelijk bij elke login draaien. Dat
 * scheelt niet alleen een tak die zelden getest wordt — het repareert ook
 * meteen de gebruikers die zich al registreerden toen deze rijen nog niet
 * werden aangemaakt, bij hun eerstvolgende login. Een verzet tijdstip
 * (updateRun in src/lib/actions.ts) overleeft dit ongeschonden: bestaande
 * rijen worden overgeslagen, niet bijgewerkt.
 *
 * Geen `days`/`channel`/`enabled` meegeven: die staan als default op het
 * schema, en één plek waar ze vandaan komen is er één te weinig om uit elkaar
 * te laten lopen.
 */
export async function ensureDefaultRuns(userId: string): Promise<void> {
  await ownerPrisma.scheduledRun.createMany({
    data: RUN_DEFAULTS.map((run) => ({ user_id: userId, kind: run.kind, at: run.at })),
    skipDuplicates: true,
  });
}
