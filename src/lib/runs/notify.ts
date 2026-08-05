import nodemailer from "nodemailer";
import { ownerPrisma } from "@/lib/db/owner-prisma";
import { withUser } from "@/lib/db/with-user";
import { localMinutes, parseTime, RUN_LABELS, type RunKind } from "./schedule";
import type { RunResult } from "@/brain/runs/types";

/**
 * Stuurt het bericht van een geplande run.
 *
 * Drie dingen kunnen een bericht tegenhouden, en alledrie horen dat te doen:
 *
 * - **Stille uren.** Een avondrun om 20:00 is prima; een herhaalpoging om
 *   23:30 niet. De run zelf draait wel — de stand klopt dan gewoon in de app.
 * - **"Stuur geen gevoelige details".** Dan gaat alleen de mededeling dát er
 *   iets is de deur uit. Bij een app die schulden en zorgkosten leest is een
 *   meldingsbalk op een vergrendeld scherm een lek.
 * - **Geen mailserver ingesteld.** Dan verstuurt hij niets en noteert de run
 *   `notified: false`. Eerlijk falen, niet stil doen alsof.
 *
 * Elke uitkomst geeft een reden terug. Een `false` zonder uitleg dwingt je
 * later om in code te gaan zoeken waarom je niets kreeg — precies het soort
 * stilte dat deze app juist wil wegnemen.
 */

export interface Meldresultaat {
  verstuurd: boolean;
  reden?: string;
}
export async function stuurRunBericht(
  userId: string,
  kind: RunKind,
  resultaat: RunResult,
  now: Date = new Date(),
): Promise<Meldresultaat> {
  const server = process.env.AUTH_EMAIL_SERVER;
  if (!server) return { verstuurd: false, reden: "geen mailserver ingesteld" };

  const user = await ownerPrisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, timezone: true },
  });
  if (!user) return { verstuurd: false, reden: "gebruiker niet gevonden" };

  const instellingen = await withUser(userId, (tx) =>
    tx.userSetting.findMany({ where: { user_id: userId } }),
  );
  const waarde = (key: string) => instellingen.find((s) => s.key === key)?.value;

  if (inStilleUren(waarde("quiet_hours"), user.timezone, now)) {
    return { verstuurd: false, reden: `stille uren (${waarde("quiet_hours")})` };
  }

  const magDetails = waarde("sensitive_in_push") === "true" || !resultaat.sensitive;
  const tekst = magDetails && resultaat.detail ? resultaat.detail : "Open Wingman om te zien wat er is.";

  try {
    const transport = nodemailer.createTransport(server);
    await transport.sendMail({
      to: user.email,
      from: process.env.AUTH_EMAIL_FROM || "Wingman <noreply@wingman.app>",
      subject: magDetails ? resultaat.summary : "Er is iets voor je",
      text: `${RUN_LABELS[kind]}\n\n${magDetails ? resultaat.summary : ""}\n\n${tekst}\n`,
    });
    return { verstuurd: true };
  } catch (err) {
    // De run zelf is geslaagd; alleen de bezorging niet. Dat onderscheid moet
    // in het logboek blijven staan, anders lijkt een mailprobleem op een
    // mislukte briefing.
    return {
      verstuurd: false,
      reden: `mail mislukt: ${err instanceof Error ? err.message : "onbekend"}`,
    };
  }
}

/**
 * "22:00-07:00" — een venster dat over middernacht heen loopt is de normale
 * vorm, niet het randgeval. Vandaar de omgekeerde vergelijking als het einde
 * vóór het begin ligt.
 */
export function inStilleUren(venster: string | undefined, timezone: string, now: Date): boolean {
  if (!venster) return false;
  const [van, tot] = venster.split("-");
  if (!van || !tot) return false;

  const nu = localMinutes(timezone, now);
  const start = parseTime(van.trim());
  const eind = parseTime(tot.trim());

  return start <= eind ? nu >= start && nu < eind : nu >= start || nu < eind;
}
