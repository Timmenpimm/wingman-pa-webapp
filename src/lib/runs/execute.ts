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
import { callAnthropic, isAnthropicConfigured } from "@/brain/llm";
import {
  applyExtractionPlan,
  planExtractions,
  MAX_EMAILS_PER_USER_PER_TICK,
  type ApplyOutcome,
  type EmailToExtract,
  type ExtractTx,
} from "@/brain/extract-commitments";
import { isDue, isRunKind, parseDays, type RunKind } from "./schedule";
import { stuurEscalatieBericht, stuurRunBericht, type Meldresultaat } from "./notify";
import { processUserEscalations, type EscalationTx } from "@/lib/escalation/engine";

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
 *
 * Ná sync en extractie, vóór de geplande momenten: de escalatielaag (Fase 1).
 * Die staat los van ScheduledRun — hij draait voor élke gebruiker, elke tick,
 * ongeacht of er om dit moment een briefing gepland staat. Dat is het hele
 * punt: escalatie is precies de laag die niet op het vaste ritme wacht.
 */

const RECEPTEN: Record<RunKind, Recipe> = { morning, midday, evening };

export interface TickUitslag {
  bekeken: number;
  uitgevoerd: Array<{ userId: string; kind: string; status: string; summary?: string }>;
  sync: { bekeken: number; uitgevoerd: SyncOutcome[] };
  extractie: { gebruikers: number; gescand: number; aangemaakt: number; overgeslagen: number };
  escalatie: { gebruikers: number; geescaleerd: number };
}

export async function tick(now: Date = new Date()): Promise<TickUitslag> {
  const sync = await syncActiveConnectors(now);
  // Ná de sync, vóór de recepten: een mail die deze tick net binnenkwam mag
  // dezelfde tick nog worden geëxtraheerd, zodat de ochtendbriefing 'm al
  // ziet als open belofte.
  const extractie = await extractCommitmentsForAllUsers(now);
  const escalatie = await escaleerVoorAlleGebruikers(now);

  // Over alle gebruikers heen kijken kan niet achter RLS langs — dit is
  // systeemwerk, geen gebruikersverzoek. Vandaar de eigenaarsrol, en meteen
  // daarna per gebruiker weer terug in withUser().
  const runs = await ownerPrisma.scheduledRun.findMany({
    where: { enabled: true },
    include: { user: { select: { id: true, timezone: true } } },
  });

  const uitslag: TickUitslag = { bekeken: runs.length, uitgevoerd: [], sync, extractie, escalatie };

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

/**
 * Commitment-extractie voor alle gebruikers met ongeziene mail (Fase 0,
 * laatste stap). Zonder ANTHROPIC_API_KEY wordt er niets bevraagd en niets
 * gemarkeerd — extractie gebeurt gewoon later alsnog, zodra de key er is
 * (zie src/brain/llm.ts en CLAUDE.md-regel 3).
 *
 * Per gebruiker: eerst lezen (eigen withUser-tx, RLS), dan het netwerkwerk
 * (planExtractions — geen tx), dan schrijven (tweede, korte withUser-tx) —
 * dezelfde volgorde als syncActiveConnectors/syncConnector hierboven. Een
 * gebruiker met een kapotte batch mag een andere gebruiker niet raken.
 */
async function extractCommitmentsForAllUsers(
  now: Date,
): Promise<{ gebruikers: number; gescand: number; aangemaakt: number; overgeslagen: number }> {
  if (!isAnthropicConfigured()) {
    return { gebruikers: 0, gescand: 0, aangemaakt: 0, overgeslagen: 0 };
  }

  // Systeemwerk over alle gebruikers heen — zelfde reden als bij
  // syncActiveConnectors om hier de eigenaarsrol te gebruiken: dit is geen
  // verzoek namens één ingelogde gebruiker.
  const rijenMetOngezieneMail = await ownerPrisma.email.findMany({
    where: { processed_at: null },
    select: { user_id: true },
    distinct: ["user_id"],
  });

  let gescand = 0;
  let aangemaakt = 0;
  let overgeslagen = 0;

  for (const { user_id: userId } of rijenMetOngezieneMail) {
    try {
      const emails: EmailToExtract[] = await withUser(userId, (tx) =>
        tx.email.findMany({
          where: { processed_at: null },
          orderBy: { sent_at: "asc" },
          take: MAX_EMAILS_PER_USER_PER_TICK,
          select: { id: true, subject: true, from_addr: true, is_sent: true, body_text: true, sent_at: true },
        }),
      );
      if (emails.length === 0) continue;

      const plan = await planExtractions(emails, callAnthropic);

      const outcome: ApplyOutcome = await withUser(userId, (tx) =>
        applyExtractionPlan(tx as unknown as ExtractTx, userId, plan, now),
      );

      gescand += emails.length;
      aangemaakt += outcome.created;
      overgeslagen += outcome.skipped;
    } catch {
      // Eén gebruiker met een kapotte batch (bv. een db-hik bij het lezen)
      // mag de rest van de tick niet blokkeren — volgende tick opnieuw.
      continue;
    }
  }

  return { gebruikers: rijenMetOngezieneMail.length, gescand, aangemaakt, overgeslagen };
}

/**
 * Escalatie (Fase 1, src/lib/escalation/) voor alle gebruikers. Zelfde vorm
 * als syncActiveConnectors/extractCommitmentsForAllUsers hierboven:
 * eigenaarsrol om over gebruikers heen te kijken, dan per gebruiker terug
 * naar withUser() voor het echte lees- en schrijfwerk, met een eigen
 * foutisolatie zodat één kapotte gebruiker de rest van de tick niet blokkeert.
 *
 * Het versturen (stuurEscalatieBericht — push indien mogelijk, anders mail)
 * gebeurt bewust buiten de tx van processUserEscalations: dat schrijfblok
 * moet kort blijven, en een mail- of pushaanroep die vastloopt mag de
 * EscalationEvent-rij niet blokkeren die net is aangemaakt (die staat er dan
 * al, en voorkomt dat dezelfde deadline een tick later opnieuw "nieuw" is).
 */
async function escaleerVoorAlleGebruikers(
  now: Date,
): Promise<{ gebruikers: number; geescaleerd: number }> {
  const gebruikers = await ownerPrisma.user.findMany({ select: { id: true, timezone: true } });

  let geescaleerd = 0;

  for (const gebruiker of gebruikers) {
    try {
      const events = await withUser(gebruiker.id, (tx) =>
        processUserEscalations(tx as unknown as EscalationTx, gebruiker.id, gebruiker.timezone, now),
      );

      for (const event of events) {
        await stuurEscalatieBericht(gebruiker.id, event.message).catch(() => undefined);
        geescaleerd += 1;
      }
    } catch {
      // Eén gebruiker met een kapotte batch (db-hik, kapotte instelling) mag
      // de rest van de tick niet blokkeren — volgende tick opnieuw.
      continue;
    }
  }

  return { gebruikers: gebruikers.length, geescaleerd };
}
