import { withUser } from "@/lib/db/with-user";
import { asLevel, mostRestrictiveLevel, type Domain, type MandateLevel } from "@/lib/mandates/domains";
import { RUN_DEFAULTS, RUN_KINDS, isRunKind, type RunKind } from "@/lib/runs/schedule";
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
}

export interface OnboardingStatus {
  steps: StepState[];
  finishedAt: Date | null;
  /** Alleen de connectors die bij de gevraagde stap horen. */
  connectors: ConnectorSummary[];
  /**
   * Het huidige mandaatniveau voor de domeinen van deze stap — de
   * voorzichtigste van de twee als een stap ooit meer dan één domein krijgt,
   * of niveau 1 als er nog geen Mandate-rij bestaat. Zie mostRestrictiveLevel
   * in src/lib/mandates/domains.ts.
   */
  mandateLevel: MandateLevel;
  /**
   * Alle Mandate-rijen van de gebruiker, ongeacht welke stap gevraagd is —
   * niet alleen die van de domeinen uit `step`. Het klaar-scherm vat samen wat
   * er over de hele onboarding heen is ingesteld, en dat kan niet uit de
   * domeinen van één stap afgeleid worden. Generiek over elk domein in
   * DOMAIN_REGISTRY: een nieuw domein hoeft hier niets aan te passen, het
   * verschijnt vanzelf zodra er een Mandate-rij voor bestaat.
   */
  mandates: Array<{ domain: Domain; level: MandateLevel }>;
  /** "22:00-07:00", of null als er nog geen stille uren zijn gekozen. */
  quietHours: string | null;
}

export type Payoff =
  | { kind: "agenda"; events: number; next: { title: string; start_at: Date } | null }
  | { kind: "mail"; people: number; open: number }
  | { kind: "bank"; transactions: number; needsReview: number; incoming: number }
  | { kind: "meldingen"; runs: Array<{ kind: RunKind; at: string; enabled: boolean }> }
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
  const domains = step ? stepDefinition(step).domains : [];

  return withUser(userId, async (tx) => {
    const [connectors, settings, mandates] = await Promise.all([
      tx.connector.findMany({
        where: { user_id: userId },
        select: { id: true, provider: true, label: true, status: true, permission: true },
        orderBy: { type: "asc" },
      }),
      tx.userSetting.findMany({
        where: { user_id: userId },
        select: { key: true, value: true },
      }),
      // Altijd alle domeinen, niet alleen die van `step`: het klaar-scherm
      // (geen step) vat samen wat er over de hele wizard heen gekozen is, en
      // dat weet dit bestand niet vooraf — zie `mandates` op OnboardingStatus.
      tx.mandate.findMany({
        where: { user_id: userId },
        select: { domain: true, level: true },
      }),
    ]);

    const steps = deriveSteps({ connectors, marks: marksFromSettings(settings) });
    const finished = settings.find((s) => s.key === FINISHED_KEY)?.value;
    const mandatesTyped = mandates.map((m) => ({ domain: m.domain as Domain, level: asLevel(m.level) }));
    const mandateLevel = mostRestrictiveLevel(
      mandatesTyped.filter((m) => (domains as string[]).includes(m.domain)).map((m) => m.level),
    );
    const quietHours = settings.find((s) => s.key === "quiet_hours")?.value ?? null;

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

    if (step === "meldingen") {
      // Voor een net geregistreerde gebruiker bestaat er soms nog geen
      // ScheduledRun-rij (die worden vandaag alleen door prisma/seed.ts
      // gezet). RUN_DEFAULTS is dan het eerlijke antwoord: dat is precies
      // wat er komt te staan zodra de rijen er wél zijn.
      const rows = await tx.scheduledRun.findMany({
        where: { user_id: userId },
        select: { kind: true, at: true, enabled: true },
      });
      const bijKind = new Map(rows.filter((r) => isRunKind(r.kind)).map((r) => [r.kind, r]));
      const runs = RUN_KINDS.map((kind) => {
        const rij = bijKind.get(kind);
        const fallback = RUN_DEFAULTS.find((d) => d.kind === kind)!;
        return { kind, at: rij?.at ?? fallback.at, enabled: rij?.enabled ?? true };
      });
      payoff = { kind: "meldingen", runs };
    }

    return {
      steps,
      finishedAt: finished ? new Date(finished) : null,
      connectors: connectors
        .filter((c) => (providers as string[]).includes(c.provider))
        .map((c) => ({ id: c.id, provider: c.provider, label: c.label, status: c.status })),
      mandateLevel,
      mandates: mandatesTyped,
      quietHours,
      payoff,
    };
  });
}
