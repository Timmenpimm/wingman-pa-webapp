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
 */
export async function stuurRunBericht(
  userId: string,
  kind: RunKind,
  resultaat: RunResult,
  now: Date = new Date(),
): Promise<boolean> {
  const server = process.env.AUTH_EMAIL_SERVER;
  if (!server) return false;

  const user = await ownerPrisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, timezone: true },
  });
  if (!user) return false;

  const instellingen = await withUser(userId, (tx) =>
    tx.userSetting.findMany({ where: { user_id: userId } }),
  );
  const waarde = (key: string) => instellingen.find((s) => s.key === key)?.value;

  if (inStilleUren(waarde("quiet_hours"), user.timezone, now)) return false;

  const magDetails = waarde("sensitive_in_push") === "true" || !resultaat.sensitive;
  const tekst = magDetails && resultaat.detail ? resultaat.detail : "Open Wingman om te zien wat er is.";

  const transport = nodemailer.createTransport(server);
  await transport.sendMail({
    to: user.email,
    from: process.env.AUTH_EMAIL_FROM || "Wingman <noreply@wingman.app>",
    subject: magDetails ? resultaat.summary : "Er is iets voor je",
    text: `${RUN_LABELS[kind]}\n\n${magDetails ? resultaat.summary : ""}\n\n${tekst}\n`,
  });

  return true;
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
