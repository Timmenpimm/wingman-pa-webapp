import { localIsoWeekKey } from "@/lib/day";
import { findTool } from "@/lib/tools/registry";
import type { Tx } from "@/lib/db/with-user";
import { DOMAINS, type Domain, type MandateLevel } from "./domains";

/**
 * De vertrouwensloop, fase 1: "vertrouwen groeit door controleerbaarheid".
 *
 * Zelfde opzet als src/lib/escalation/engine.ts: een pure kern
 * (`evaluateMandateSuggestion`) die alleen met al-opgehaalde feiten en een
 * meegegeven klok werkt — dus testbaar zonder database — en een dunne,
 * onzuivere laag (`computeMandateSuggestionsForUser`) die het weekmoment en de
 * tx-reads/writes eromheen doet.
 *
 * De regel (uit de opdracht): draait een domein ≥28 dagen op niveau 2, met in
 * die periode ≥5 uitgevoerde toolcalls in dat domein en 0 met status
 * "rejected", dan één voorstel om naar niveau 3 te gaan. Eénmalig: nooit een
 * tweede voorstel voor hetzelfde domein zolang er al een suggestie bestaat
 * (welke status ook) met to_level 3.
 */

const MIN_AGE_DAYS = 28;
const MIN_DONE_CALLS = 5;
const TARGET_LEVEL: MandateLevel = 3;

export interface SuggestionEvidence {
  dagen: number;
  calls: number;
  rejected: number;
}

export interface SuggestionCandidateInput {
  now: Date;
  /** Huidig mandaatniveau van het domein — de regel geldt alleen bij niveau 2. */
  mandateLevel: MandateLevel;
  /** Sinds wanneer dit niveau geldt (Mandate.updated_at). */
  mandateSince: Date;
  /** Aantal toolcalls met status "done" in dit domein, sinds `mandateSince`. */
  doneCallCount: number;
  /** Aantal toolcalls met status "rejected" in dit domein, sinds `mandateSince`. */
  rejectedCallCount: number;
  /** Bestaat er al een suggestie (welke status ook) met to_level 3 voor dit domein? */
  alreadyHasLevel3Suggestion: boolean;
}

export interface SuggestionVerdict {
  propose: boolean;
  evidence: SuggestionEvidence;
}

/**
 * Puur: geen database, geen netwerk. `now` en `mandateSince` komen binnen als
 * argument, niet als `new Date()` — dezelfde reden als bij `isDue` in
 * src/lib/runs/schedule.ts: dit is precies de plek waar een dagtelling stiekem
 * fout gaat, en dat wil je in een test kunnen naspelen.
 */
export function evaluateMandateSuggestion(input: SuggestionCandidateInput): SuggestionVerdict {
  const dagen = Math.floor(
    (input.now.getTime() - input.mandateSince.getTime()) / 86_400_000,
  );
  const evidence: SuggestionEvidence = {
    dagen,
    calls: input.doneCallCount,
    rejected: input.rejectedCallCount,
  };

  if (input.alreadyHasLevel3Suggestion) return { propose: false, evidence };
  if (input.mandateLevel !== 2) return { propose: false, evidence };
  if (dagen < MIN_AGE_DAYS) return { propose: false, evidence };
  if (input.doneCallCount < MIN_DONE_CALLS) return { propose: false, evidence };
  if (input.rejectedCallCount > 0) return { propose: false, evidence };

  return { propose: true, evidence };
}

/* ---------- Het weekmoment ------------------------------------------------ */

const WEEK_SETTING_KEY = "mandate_suggestion_week";

/**
 * Berekent (en schrijft) de promotievoorstellen voor één gebruiker — maar
 * hoogstens één keer per lokale ISO-week, in dezelfde tick die ook de
 * escalatielaag draait (src/lib/runs/execute.ts). Zelfde patroon als
 * RunLog/ScheduledRun.last_run_on voor de dagelijkse runs: een UserSetting
 * onthoudt de laatst verwerkte weeksleutel ("2026-W32"), en een tick binnen
 * dezelfde week doet niets.
 *
 * Alleen domeinen die nu op niveau 2 staan komen in aanmerking — de regel
 * gaat over die promotie, niet over willekeurige domeinen.
 */
export async function computeMandateSuggestionsForUser(
  tx: Tx,
  userId: string,
  timezone: string,
  now: Date,
): Promise<Domain[]> {
  const weekKey = localIsoWeekKey(timezone, now);

  const setting = await tx.userSetting.findUnique({
    where: { user_id_key: { user_id: userId, key: WEEK_SETTING_KEY } },
  });
  if (setting?.value === weekKey) return [];

  const created: Domain[] = [];

  const mandates = await tx.mandate.findMany({ where: { user_id: userId, level: 2 } });
  const existingSuggestions = await tx.mandateSuggestion.findMany({
    where: { user_id: userId },
    select: { domain: true, to_level: true },
  });
  const hasLevel3SuggestionFor = new Set(
    existingSuggestions.filter((s) => s.to_level === TARGET_LEVEL).map((s) => s.domain),
  );

  for (const mandate of mandates) {
    const domain = mandate.domain;
    if (!DOMAINS.includes(domain as Domain)) continue; // onbekend domein — niets om over te oordelen

    const calls = await tx.toolCall.findMany({
      where: {
        user_id: userId,
        created_at: { gte: mandate.updated_at },
        status: { in: ["done", "rejected"] },
      },
      select: { tool: true, status: true },
    });
    const inDomain = calls.filter((c) => toolDomain(c.tool) === domain);
    const doneCallCount = inDomain.filter((c) => c.status === "done").length;
    const rejectedCallCount = inDomain.filter((c) => c.status === "rejected").length;

    const verdict = evaluateMandateSuggestion({
      now,
      mandateLevel: 2,
      mandateSince: mandate.updated_at,
      doneCallCount,
      rejectedCallCount,
      alreadyHasLevel3Suggestion: hasLevel3SuggestionFor.has(domain),
    });

    if (!verdict.propose) continue;

    await tx.mandateSuggestion.create({
      data: {
        user_id: userId,
        domain,
        from_level: 2,
        to_level: TARGET_LEVEL,
        evidence: JSON.stringify(verdict.evidence),
      },
    });
    created.push(domain as Domain);
  }

  await tx.userSetting.upsert({
    where: { user_id_key: { user_id: userId, key: WEEK_SETTING_KEY } },
    create: { user_id: userId, key: WEEK_SETTING_KEY, value: weekKey },
    update: { value: weekKey },
  });

  return created;
}

/**
 * Toolnaam → domein, via de bestaande toolcatalogus (src/lib/tools/registry.ts)
 * — geen tweede lijst die uit de pas kan lopen. Een tool die niet meer bestaat
 * (adapter aangepast na de aanroep) levert `undefined`: die call telt dan
 * nergens voor mee in plaats van de hele berekening te laten knappen.
 */
function toolDomain(toolName: string): Domain | undefined {
  try {
    return findTool(toolName).tool.domain;
  } catch {
    return undefined;
  }
}
