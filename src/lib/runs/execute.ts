import { withUser } from "@/lib/db/with-user";
import { ownerPrisma } from "@/lib/db/owner-prisma";
import { clamp } from "@/lib/text";
import { morning } from "@/brain/runs/morning";
import { midday } from "@/brain/runs/midday";
import { evening } from "@/brain/runs/evening";
import type { Recipe, RunResult } from "@/brain/runs/types";
import { adapterFor } from "@/connectors";
import type { Provider } from "@/lib/types";
import { SYNCABLE_PROVIDERS, syncConnector, type SyncOutcome, type SyncTx } from "@/lib/sync/engine";
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
 *
 * Vóór de recepten synct elke tick eerst de bronnen zelf (Fase 0): zonder dat
 * blijft een gekoppelde agenda of mailbox leeg totdat iemand handmatig
 * fetchDelta aanroept. Geen aparte cron — dezelfde 15-minuten-tik die de
 * briefings uitvoert, doet ook de sync, en wel eerst: een briefing die ná een
 * sync gebouwd wordt ziet de nieuwste data.
 */

const RECEPTEN: Record<RunKind, Recipe> = { morning, midday, evening };

export interface TickUitslag {
  bekeken: number;
  uitgevoerd: Array<{ userId: string; kind: string; status: string; summary?: string }>;
  sync: { bekeken: number; uitgevoerd: SyncOutcome[] };
}

export async function tick(now: Date = new Date()): Promise<TickUitslag> {
  const sync = await syncActiveConnectors(now);

  // Over alle gebruikers heen kijken kan niet achter RLS langs — dit is
  // systeemwerk, geen gebruikersverzoek. Vandaar de eigenaarsrol, en meteen
  // daarna per gebruiker weer terug in withUser().
  const runs = await ownerPrisma.scheduledRun.findMany({
    where: { enabled: true },
    include: { user: { select: { id: true, timezone: true } } },
  });

  const uitslag: TickUitslag = { bekeken: runs.length, uitgevoerd: [], sync };

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

/**
 * Synct elke connector met een werkende adapter (google, gmail — zie
 * SYNCABLE_PROVIDERS), voor alle gebruikers. Ponto/CalDAV/IMAP hebben geen
 * adapterimplementatie in deze fase en worden hier al buiten de query
 * gehouden: stil overgeslagen, geen foutmelding voor iets dat nooit
 * geprobeerd is.
 *
 * Een connector op `reauth_required` wordt niet opnieuw geprobeerd: zonder
 * geldig refresh_token faalt een nieuwe poging toch weer op dezelfde manier,
 * en de briefing meldt die staat al als degraded (CLAUDE.md-regel 2). Een
 * connector op `error` juist wel — dat is precies de "volgende tick opnieuw
 * proberen"-belofte uit dezelfde regel.
 */
async function syncActiveConnectors(
  now: Date,
): Promise<{ bekeken: number; uitgevoerd: SyncOutcome[] }> {
  const connectors = await ownerPrisma.connector.findMany({
    where: {
      provider: { in: [...SYNCABLE_PROVIDERS] },
      status: { in: ["active", "error"] },
    },
  });

  const uitgevoerd: SyncOutcome[] = [];

  for (const connector of connectors) {
    const adapter = adapterFor(connector.provider as Provider);
    if (!adapter) continue; // geen adapter geregistreerd — stil overslaan

    try {
      const outcome = await syncConnector({
        adapter,
        connector,
        now,
        // SyncTx is met opzet een smalle, met de hand geschreven vorm (voor
        // testbaarheid zonder database — zie de toelichting in
        // src/lib/sync/engine.ts), dus geen structurele match voor Prisma's
        // gegenereerde (generieke) upsert-signatuur. De echte tx heeft alles
        // wat SyncTx gebruikt; dit is de enige plek waar dat overbrugd wordt.
        withTx: (fn) => withUser(connector.user_id, (tx) => fn(tx as unknown as SyncTx)),
      });
      uitgevoerd.push(outcome);
    } catch (err) {
      // Een fout die niet uit fetchDelta zelf komt (syncConnector vangt dat
      // al af) mag nog steeds geen andere connector of gebruiker blokkeren.
      uitgevoerd.push({
        provider: connector.provider,
        connectorId: connector.id,
        status: "error",
        count: 0,
        message: err instanceof Error ? err.message : "onbekende fout",
      });
    }
  }

  return { bekeken: connectors.length, uitgevoerd };
}
