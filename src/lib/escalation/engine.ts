import { localDateKey } from "@/lib/day";
import { inStilleUren } from "@/lib/runs/notify";
import {
  CHILDREN_SIGNALS_SETTING_KEY,
  HOUSING_CRITERIA_SETTING_KEY,
  detectChildren,
  detectDeadline24h,
  detectHousingLongterm,
  detectMoneyUnexpected,
  parseChildrenSignalConfig,
  parseHousingCriteria,
  type ChildrenSignalConfig,
  type CommitmentCandidate,
  type EmailCandidate,
  type EscalationCandidate,
  type EventCandidate,
  type HousingCriteria,
  type TransactionCandidate,
  type TriggerId,
} from "./triggers";

/**
 * De escalatie-engine: bepaalt per tick, per gebruiker, welke openstaande
 * items het huidige briefingritme mogen doorbreken.
 *
 * Zelfde opzet als src/lib/sync/engine.ts en src/brain/extract-commitments.ts:
 * een pure kern (`planEscalations`) die alleen met al-opgehaalde data en een
 * meegegeven klok werkt — dus testbaar zonder database — en een dunne,
 * onzuivere laag (`processUserEscalations`) die de tx-reads/writes eromheen
 * doet. De pure kern is waar dagcap, dedupe, stille uren en triggerlogica
 * zitten; dat zijn precies de dingen die in productie om 3 uur 's nachts fout
 * gaan als ze niet in een test staan.
 *
 * Twee regels die hier de kern van zijn:
 *
 * 1. **Dagcap van 2, in de tijdzone van de gebruiker.** Wat daarboven valt
 *    wacht gewoon op de eerstvolgende briefing — die toont het toch al, dus
 *    er hoeft niets aparts onthouden te worden voor "morgen alsnog".
 * 2. **Stille uren schuiven, ze laten niets verdwijnen.** Binnen het venster
 *    wordt er niets aangemaakt en niets verstuurd; dezelfde kandidaat is de
 *    eerstvolgende tick buiten het venster nog gewoon kandidaat, want er is
 *    dan nog geen EscalationEvent voor geschreven.
 */

const DAILY_CAP = 2;

export interface PlanInput {
  now: Date;
  timezone: string;
  quietHours: string | undefined;
  commitments: CommitmentCandidate[];
  transactions: TransactionCandidate[];
  emails: EmailCandidate[];
  events: EventCandidate[];
  /** Configuratie voor de `children`-trigger — `null` = nog niet ingesteld, dus geen kandidaten. */
  childrenSignals: ChildrenSignalConfig | null;
  /** Configuratie voor de `housing_longterm`-trigger — `null` = nog niet ingesteld, dus geen kandidaten. */
  housingCriteria: HousingCriteria | null;
  /** Ooit al geëscaleerd voor deze gebruiker — dedupe geldt voor altijd, niet per dag. */
  alreadyEscalated: Array<{ trigger: TriggerId; ref_id: string }>;
  /** Hoeveel er vandaag al lokaal geëscaleerd zijn — bepaalt wat er nog in de dagcap past. */
  escalatedTodayCount: number;
}

export interface PlanOutput {
  /** true = niets gedaan omdat "nu" binnen de stille uren van de gebruiker valt. */
  deferredQuietHours: boolean;
  /** Kandidaten die nu geëscaleerd mogen worden, al begrensd door de dagcap. */
  toEscalate: EscalationCandidate[];
}

export function planEscalations(input: PlanInput): PlanOutput {
  if (inStilleUren(input.quietHours, input.timezone, input.now)) {
    return { deferredQuietHours: true, toEscalate: [] };
  }

  const already = new Set(input.alreadyEscalated.map((e) => escalationKey(e.trigger, e.ref_id)));

  // Kinderen en langetermijn-wonen staan vóóraan: allebei "direct melden" /
  // "weg is weg" (WINGMAN_ADDENDUM_mandaten.md §2 noemt kinderen expliciet
  // "hoogste prioriteit", §3 zet wonen naast schuldendeadlines). Bij een volle
  // dagcap van 2 mogen die twee niet achter een routineuze deadline of
  // transactie blijven wachten tot de volgende dag.
  const candidates = [
    ...detectChildren(input.emails, input.events, input.childrenSignals),
    ...detectHousingLongterm(input.emails, input.housingCriteria),
    ...detectDeadline24h(input.commitments, input.now),
    ...detectMoneyUnexpected(input.transactions),
  ].filter((c) => !already.has(escalationKey(c.trigger, c.ref_id)));

  const remaining = Math.max(0, DAILY_CAP - input.escalatedTodayCount);

  return { deferredQuietHours: false, toEscalate: candidates.slice(0, remaining) };
}

function escalationKey(trigger: TriggerId, refId: string): string {
  return `${trigger}:${refId}`;
}

/** Wat processUserEscalations van een tx nodig heeft — smal, zoals SyncTx/ExtractTx. */
export interface EscalationTx {
  userSetting: {
    findUnique(args: {
      where: { user_id_key: { user_id: string; key: string } };
    }): Promise<{ value: string } | null>;
  };
  commitment: {
    findMany(args: {
      where: { user_id: string; status: string };
      select: { id: true; status: true; due_date: true };
    }): Promise<CommitmentCandidate[]>;
  };
  transaction: {
    findMany(args: {
      where: { user_id: string; needs_review: true };
      select: { id: true; needs_review: true };
    }): Promise<TransactionCandidate[]>;
  };
  /** Alleen recente mail — zie EMAIL_LOOKBACK_MS hieronder voor waarom dit begrensd is. */
  email: {
    findMany(args: {
      where: { user_id: string; sent_at: { gte: Date } };
      select: { id: true; subject: true; from_addr: true; to_addrs: true; body_text: true };
    }): Promise<EmailCandidate[]>;
  };
  /** Alleen events rond nu — zie EVENT_LOOKBACK_MS/EVENT_LOOKAHEAD_MS hieronder. */
  event: {
    findMany(args: {
      where: { user_id: string; start_at: { gte: Date; lte: Date } };
      select: { id: true; title: true; attendees: true };
    }): Promise<EventCandidate[]>;
  };
  escalationEvent: {
    findMany(args: {
      where: { user_id: string };
      select: { trigger: true; ref_id: true; created_at: true };
    }): Promise<Array<{ trigger: string; ref_id: string; created_at: Date }>>;
    create(args: {
      data: { user_id: string; trigger: string; ref_id: string; message: string };
    }): Promise<unknown>;
  };
}

// Mail en agenda-items worden — anders dan commitments (status=open) en
// transacties (needs_review=true) — niet door een eigen statusveld begrensd:
// er is geen "moet nog op kinderen/wonen gecheckt worden"-vlag. Dedupe in
// planEscalations voorkomt een dubbele escalatie, maar zonder een
// tijdvenster zou elke tick de hele mailbox/agenda opnieuw doorzoeken. Een
// escalatie hoort per definitie bij iets recents ("net binnengekomen"), dus
// een venster is hier geen kunstmatige beperking maar precies wat de trigger
// betekent.
const EMAIL_LOOKBACK_MS = 48 * 60 * 60 * 1000; // mail van de laatste 2 dagen
const EVENT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // events die net begonnen/lopend zijn tellen nog mee
const EVENT_LOOKAHEAD_MS = 30 * 24 * 60 * 60 * 1000; // "kids-dagen" liggen meestal in de eerstvolgende weken

/**
 * Leest wat de detectors nodig hebben, laat de pure kern beslissen, en
 * schrijft precies de nieuw gekozen escalaties weg. Een unieke-sleutelbotsing
 * bij het schrijven (een andere tick was net eerder) is geen fout — gewoon
 * overslaan, want dan staat de rij er al.
 */
export async function processUserEscalations(
  tx: EscalationTx,
  userId: string,
  timezone: string,
  now: Date,
): Promise<EscalationCandidate[]> {
  const [
    quietHoursSetting,
    childrenSignalsSetting,
    housingCriteriaSetting,
    commitments,
    transactions,
    emails,
    events,
    existingEvents,
  ] = await Promise.all([
    tx.userSetting.findUnique({ where: { user_id_key: { user_id: userId, key: "quiet_hours" } } }),
    tx.userSetting.findUnique({
      where: { user_id_key: { user_id: userId, key: CHILDREN_SIGNALS_SETTING_KEY } },
    }),
    tx.userSetting.findUnique({
      where: { user_id_key: { user_id: userId, key: HOUSING_CRITERIA_SETTING_KEY } },
    }),
    tx.commitment.findMany({
      where: { user_id: userId, status: "open" },
      select: { id: true, status: true, due_date: true },
    }),
    tx.transaction.findMany({
      where: { user_id: userId, needs_review: true },
      select: { id: true, needs_review: true },
    }),
    tx.email.findMany({
      where: { user_id: userId, sent_at: { gte: new Date(now.getTime() - EMAIL_LOOKBACK_MS) } },
      select: { id: true, subject: true, from_addr: true, to_addrs: true, body_text: true },
    }),
    tx.event.findMany({
      where: {
        user_id: userId,
        start_at: {
          gte: new Date(now.getTime() - EVENT_LOOKBACK_MS),
          lte: new Date(now.getTime() + EVENT_LOOKAHEAD_MS),
        },
      },
      select: { id: true, title: true, attendees: true },
    }),
    tx.escalationEvent.findMany({
      where: { user_id: userId },
      select: { trigger: true, ref_id: true, created_at: true },
    }),
  ]);

  const today = localDateKey(timezone, now);
  const escalatedTodayCount = existingEvents.filter(
    (e) => localDateKey(timezone, e.created_at) === today,
  ).length;

  const plan = planEscalations({
    now,
    timezone,
    quietHours: quietHoursSetting?.value,
    commitments,
    transactions,
    emails,
    events,
    childrenSignals: parseChildrenSignalConfig(childrenSignalsSetting?.value),
    housingCriteria: parseHousingCriteria(housingCriteriaSetting?.value),
    alreadyEscalated: existingEvents.map((e) => ({ trigger: e.trigger as TriggerId, ref_id: e.ref_id })),
    escalatedTodayCount,
  });

  if (plan.toEscalate.length === 0) return [];

  const created: EscalationCandidate[] = [];
  for (const candidate of plan.toEscalate) {
    try {
      await tx.escalationEvent.create({
        data: {
          user_id: userId,
          trigger: candidate.trigger,
          ref_id: candidate.ref_id,
          message: candidate.message,
        },
      });
      created.push(candidate);
    } catch {
      // Unieke-sleutelbotsing: een andere tick was net eerder met precies
      // dezelfde (user_id, trigger, ref_id). Niets meer te doen, niet melden.
      continue;
    }
  }

  return created;
}
