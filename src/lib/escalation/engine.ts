import { localDateKey } from "@/lib/day";
import { inStilleUren } from "@/lib/runs/notify";
import {
  detectDeadline24h,
  detectMoneyUnexpected,
  type CommitmentCandidate,
  type EscalationCandidate,
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

  const candidates = [
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
  const [quietHoursSetting, commitments, transactions, existingEvents] = await Promise.all([
    tx.userSetting.findUnique({ where: { user_id_key: { user_id: userId, key: "quiet_hours" } } }),
    tx.commitment.findMany({
      where: { user_id: userId, status: "open" },
      select: { id: true, status: true, due_date: true },
    }),
    tx.transaction.findMany({
      where: { user_id: userId, needs_review: true },
      select: { id: true, needs_review: true },
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
