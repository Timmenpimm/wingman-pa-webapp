import { withUser } from "@/lib/db/with-user";
import { ownerPrisma } from "@/lib/db/owner-prisma";
import { clamp } from "@/lib/text";
import { morning } from "@/brain/runs/morning";
import { midday } from "@/brain/runs/midday";
import { evening } from "@/brain/runs/evening";
import type { Recipe, RunResult } from "@/brain/runs/types";
import { isDue, isRunKind, parseDays, type RunKind } from "./schedule";
import { stuurRunBericht, type Meldresultaat } from "./notify";

/**
 * Voert geplande momenten uit.
 *
 * Twee regels bepalen bijna alles hier:
 *
 * 1. Een run zonder nieuws stuurt niets. Het middagrecept geeft dan `null`
 *    terug en we loggen "overgeslagen" — geen bericht, geen ruis.
 * 2. Eén keer per lokale dag per soort. `last_run_on` wordt pas gezet als de
 *    run klaar is, zodat een crash halverwege een nieuwe poging krijgt bij de
 *    volgende tick, maar een geslaagde run nooit een tweede bericht oplevert.
 *
 * Elke gebruiker en elk soort wordt apart afgehandeld: een fout bij de één mag
 * de ander zijn briefing niet kosten.
 */

const RECEPTEN: Record<RunKind, Recipe> = { morning, midday, evening };

export interface TickUitslag {
  bekeken: number;
  uitgevoerd: Array<{ userId: string; kind: string; status: string; summary?: string }>;
}

export async function tick(now: Date = new Date()): Promise<TickUitslag> {
  // Over alle gebruikers heen kijken kan niet achter RLS langs — dit is
  // systeemwerk, geen gebruikersverzoek. Vandaar de eigenaarsrol, en meteen
  // daarna per gebruiker weer terug in withUser().
  const runs = await ownerPrisma.scheduledRun.findMany({
    where: { enabled: true },
    include: { user: { select: { id: true, timezone: true } } },
  });

  const uitslag: TickUitslag = { bekeken: runs.length, uitgevoerd: [] };

  for (const run of runs) {
    if (!isRunKind(run.kind)) continue;

    const verdict = isDue(
      {
        at: run.at,
        days: parseDays(run.days),
        enabled: run.enabled,
        last_run_on: run.last_run_on,
        timezone: run.user.timezone,
      },
      now,
    );
    if (!verdict.due) continue;

    const resultaat = await voerUit(run.user.id, run.kind, verdict.localDate, run.channel, now);
    uitslag.uitgevoerd.push({ userId: run.user.id, kind: run.kind, ...resultaat });
  }

  return uitslag;
}

async function voerUit(
  userId: string,
  kind: RunKind,
  localDate: string,
  channel: string,
  now: Date,
): Promise<{ status: string; summary?: string }> {
  const start = Date.now();

  try {
    const resultaat = await withUser(userId, (tx) => RECEPTEN[kind](tx, userId, localDate, now));

    const bericht = resultaat
      ? await meld(userId, kind, resultaat, channel)
      : { verstuurd: false, reden: "niets te melden" };

    await withUser(userId, async (tx) => {
      await tx.runLog.create({
        data: {
          user_id: userId,
          kind,
          local_date: localDate,
          status: resultaat ? "done" : "skipped",
          // Waarom er niets gemeld is, hoort hier te staan: anders zoek je
          // later in code naar de reden dat je niets kreeg.
          reason: bericht.reden ?? null,
          notified: bericht.verstuurd,
          duration_ms: Date.now() - start,
        },
      });
      await tx.scheduledRun.update({
        where: { user_id_kind: { user_id: userId, kind } },
        data: { last_run_on: localDate },
      });
    });

    return { status: resultaat ? "done" : "skipped", summary: resultaat?.summary };
  } catch (err) {
    // Niet last_run_on zetten: de volgende tick mag het opnieuw proberen. Nog
    // steeds binnen dezelfde dag, dus zonder dubbel bericht.
    const reden = clamp(err instanceof Error ? err.message : "onbekende fout", "connectorStatus");
    await withUser(userId, (tx) =>
      tx.runLog.create({
        data: {
          user_id: userId,
          kind,
          local_date: localDate,
          status: "failed",
          reason: reden,
          duration_ms: Date.now() - start,
        },
      }),
    ).catch(() => undefined); // logboek mag de fout niet vergroten
    return { status: "failed", summary: reden };
  }
}

async function meld(
  userId: string,
  kind: RunKind,
  resultaat: RunResult,
  channel: string,
): Promise<Meldresultaat> {
  if (channel === "none") return { verstuurd: false, reden: "kanaal staat uit" };
  return stuurRunBericht(userId, kind, resultaat);
}
