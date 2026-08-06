import { withUser } from "@/lib/db/with-user";
import {
  deriveSteps,
  FINISHED_KEY,
  marksFromSettings,
  stepDefinition,
  type StepId,
  type StepState,
} from "./steps";

/**
 * De onboarding zoals hij voor deze gebruiker écht is: welke stappen af zijn,
 * en wat er in de net gekoppelde bron te zien valt.
 *
 * De payoff hieronder komt uit de tabellen, nooit uit een vaste zin. Dat is de
 * hele reden dat dit bestand bestaat: het vorige onboardingscherm beweerde
 * "ik zie drie vaste blokken per week" ook als er geen enkel event stond, en
 * dat is precies het vertrouwen dat je op dat moment probeert te winnen.
 *
 * Er is nog geen sync die agenda en mail binnenhaalt (adapters hebben
 * `fetchDelta`, maar niemand roept het aan). Tot die er is, blijft de payoff
 * vaak leeg — en dan zegt het scherm dát, in plaats van iets te verzinnen.
 */

export interface ConnectorSummary {
  id: string;
  provider: string;
  label: string;
  status: string;
  permission: string;
}

export interface OnboardingStatus {
  steps: StepState[];
  finishedAt: Date | null;
  /** Alleen de connectors die bij de gevraagde stap horen. */
  connectors: ConnectorSummary[];
}

export type Payoff =
  | { kind: "agenda"; events: number; next: { title: string; start_at: Date } | null }
  | { kind: "mail"; people: number; open: number }
  | { kind: "bank"; transactions: number; needsReview: number; incoming: number }
  | { kind: "none" };

const WEEK_MS = 7 * 86_400_000;

/**
 * Eén ronde langs de database voor het hele scherm: stappen, connectors van de
 * huidige stap en de payoff. Alles binnen dezelfde withUser-transactie, zodat
 * de RLS-context één keer gezet wordt in plaats van drie keer.
 */
export async function onboardingStatus(
  userId: string,
  step?: StepId,
): Promise<OnboardingStatus & { payoff: Payoff }> {
  const providers = step ? stepDefinition(step).providers : [];

  return withUser(userId, async (tx) => {
    const [connectors, settings] = await Promise.all([
      tx.connector.findMany({
        where: { user_id: userId },
        select: { id: true, provider: true, label: true, status: true, permission: true },
        orderBy: { type: "asc" },
      }),
      tx.userSetting.findMany({
        where: { user_id: userId },
        select: { key: true, value: true },
      }),
    ]);

    const steps = deriveSteps({ connectors, marks: marksFromSettings(settings) });
    const finished = settings.find((s) => s.key === FINISHED_KEY)?.value;

    let payoff: Payoff = { kind: "none" };
    const now = new Date();

    if (step === "agenda") {
      const [events, next] = await Promise.all([
        tx.event.count({
          where: { user_id: userId, start_at: { gte: now, lt: new Date(+now + WEEK_MS) } },
        }),
        tx.event.findFirst({
          where: { user_id: userId, start_at: { gte: now } },
          orderBy: { start_at: "asc" },
          select: { title: true, start_at: true },
        }),
      ]);
      payoff = { kind: "agenda", events, next };
    }

    if (step === "mail") {
      const [people, open] = await Promise.all([
        tx.person.count({ where: { user_id: userId } }),
        tx.commitment.count({ where: { user_id: userId, status: "open" } }),
      ]);
      payoff = { kind: "mail", people, open };
    }

    if (step === "bank") {
      const [transactions, needsReview, incoming] = await Promise.all([
        tx.transaction.count({ where: { user_id: userId } }),
        tx.transaction.count({ where: { user_id: userId, needs_review: true } }),
        tx.transaction.aggregate({
          where: {
            user_id: userId,
            amount: { gt: 0 },
            booked_at: { gte: new Date(+now - WEEK_MS) },
          },
          _sum: { amount: true },
        }),
      ]);
      payoff = {
        kind: "bank",
        transactions,
        needsReview,
        incoming: incoming._sum.amount ?? 0,
      };
    }

    return {
      steps,
      finishedAt: finished ? new Date(finished) : null,
      connectors: connectors.filter((c) => (providers as string[]).includes(c.provider)),
      payoff,
    };
  });
}
