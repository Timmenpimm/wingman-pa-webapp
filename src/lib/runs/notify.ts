import nodemailer from "nodemailer";
import { ownerPrisma } from "@/lib/db/owner-prisma";
import { withUser } from "@/lib/db/with-user";
import { sendWebPush, vapidConfigFromEnv, type PushPayload } from "@/lib/push/webpush";
import { localMinutes, parseTime, RUN_LABELS, type RunKind } from "./schedule";
import type { RunResult } from "@/brain/runs/types";

/**
 * Stuurt het bericht van een geplande run, en (nieuw) het bericht van een
 * escalatie (zie stuurEscalatieBericht onderaan).
 *
 * Drie dingen kunnen een bericht tegenhouden, en alledrie horen dat te doen:
 *
 * - **Stille uren.** Een avondrun om 20:00 is prima; een herhaalpoging om
 *   23:30 niet. De run zelf draait wel — de stand klopt dan gewoon in de app.
 * - **"Stuur geen gevoelige details".** Dan gaat alleen de mededeling dát er
 *   iets is de deur uit. Bij een app die schulden en zorgkosten leest is een
 *   meldingsbalk op een vergrendeld scherm een lek.
 * - **Geen mailserver ingesteld / geen push geconfigureerd.** Dan verstuurt
 *   dat kanaal niets. Eerlijk falen, niet stil doen alsof.
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
  const titel = magDetails ? resultaat.summary : "Er is iets voor je";
  const tekst = magDetails && resultaat.detail ? resultaat.detail : "Open Wingman om te zien wat er is.";

  // Push, naast mail: best effort, mag de mailflow hieronder niet blokkeren
  // of vertroebelen. Geen abonnement of geen VAPID-sleutels? Dan gewoon 0.
  const push = await stuurPush(userId, { title: titel, body: tekst }).catch(() => ({ verzonden: 0 }));

  const server = process.env.AUTH_EMAIL_SERVER;
  if (!server) {
    return push.verzonden > 0
      ? { verstuurd: true, reden: "alleen push (geen mailserver ingesteld)" }
      : { verstuurd: false, reden: "geen mailserver ingesteld" };
  }

  try {
    const transport = nodemailer.createTransport(server);
    await transport.sendMail({
      to: user.email,
      from: process.env.AUTH_EMAIL_FROM || "Wingman <noreply@wingman.app>",
      subject: titel,
      text: `${RUN_LABELS[kind]}\n\n${magDetails ? resultaat.summary : ""}\n\n${tekst}\n`,
    });
    return { verstuurd: true };
  } catch (err) {
    // De run zelf is geslaagd; alleen de bezorging niet. Dat onderscheid moet
    // in het logboek blijven staan, anders lijkt een mailprobleem op een
    // mislukte briefing. Push kan intussen wel gelukt zijn — dan is de
    // gebruiker toch bereikt.
    const reden = `mail mislukt: ${err instanceof Error ? err.message : "onbekend"}`;
    return push.verzonden > 0
      ? { verstuurd: true, reden: `alleen push (${reden})` }
      : { verstuurd: false, reden };
  }
}

/**
 * Het escalatiepad (src/lib/escalation/): push indien mogelijk, anders mail
 * — geen "naast elkaar" zoals bij een geplande run, want een escalatie is
 * per definitie het uitzonderingsgeval dat *nu* aandacht vraagt. Twee kanalen
 * tegelijk zou de indruk wekken dat er twee dingen zijn.
 *
 * Stille uren zijn hier met opzet geen eigen check: dat is de taak van de
 * escalatie-engine (die beslist dan om het niet als geëscaleerd te
 * registreren, zodat de eerstvolgende tick het buiten de stille uren gewoon
 * opnieuw probeert). Komt hier iets binnen, dan is dat moment door de engine
 * al goedgekeurd.
 */
export async function stuurEscalatieBericht(
  userId: string,
  message: string,
): Promise<Meldresultaat> {
  const user = await ownerPrisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user) return { verstuurd: false, reden: "gebruiker niet gevonden" };

  const instellingen = await withUser(userId, (tx) =>
    tx.userSetting.findMany({ where: { user_id: userId, key: "sensitive_in_push" } }),
  );
  const magDetails = instellingen[0]?.value === "true";
  // Bedragen en schuldeisernamen zitten sowieso nooit in `message` (zie
  // triggers.ts) — deze instelling bepaalt alleen of de (al discrete) tekst
  // getoond wordt, of de nog generiekere val-back.
  const tekst = magDetails ? message : "Er is iets dat aandacht vraagt.";

  const push = await stuurPush(userId, { title: "Wingman", body: tekst }).catch(() => ({ verzonden: 0 }));
  if (push.verzonden > 0) return { verstuurd: true };

  const server = process.env.AUTH_EMAIL_SERVER;
  if (!server) return { verstuurd: false, reden: "geen mailserver ingesteld" };

  try {
    const transport = nodemailer.createTransport(server);
    await transport.sendMail({
      to: user.email,
      from: process.env.AUTH_EMAIL_FROM || "Wingman <noreply@wingman.app>",
      subject: "Wingman",
      text: `${tekst}\n`,
    });
    return { verstuurd: true };
  } catch (err) {
    return {
      verstuurd: false,
      reden: `mail mislukt: ${err instanceof Error ? err.message : "onbekend"}`,
    };
  }
}

/**
 * Stuurt `payload` naar elk pushabonnement van de gebruiker. Geen VAPID-
 * sleutels ingesteld of geen abonnementen? Dan `{ verzonden: 0 }` — dat is
 * geen fout, dat is precies wat "push stil overslaan" betekent (zie
 * .env.example). Een verlopen abonnement (404/410 van de pushdienst) wordt
 * meteen opgeruimd: opnieuw proberen heeft dan toch geen zin, en de rij zou
 * anders bij elke run opnieuw een mislukte aanroep opleveren.
 */
async function stuurPush(userId: string, payload: PushPayload): Promise<{ verzonden: number }> {
  const vapid = vapidConfigFromEnv();
  if (!vapid) return { verzonden: 0 };

  const abonnementen = await withUser(userId, (tx) =>
    tx.pushSubscription.findMany({ where: { user_id: userId } }),
  );
  if (abonnementen.length === 0) return { verzonden: 0 };

  let verzonden = 0;
  for (const abonnement of abonnementen) {
    const resultaat = await sendWebPush(
      { endpoint: abonnement.endpoint, p256dh: abonnement.p256dh, auth: abonnement.auth },
      payload,
      vapid,
    );

    if (resultaat.ok) {
      verzonden += 1;
      await withUser(userId, (tx) =>
        tx.pushSubscription.update({ where: { id: abonnement.id }, data: { last_used_at: new Date() } }),
      ).catch(() => undefined);
    } else if (resultaat.expired) {
      await withUser(userId, (tx) => tx.pushSubscription.delete({ where: { id: abonnement.id } })).catch(
        () => undefined,
      );
    }
  }

  return { verzonden };
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
