import { findTool } from "@/lib/tools/registry";
import { DOMAIN_REGISTRY, LEVEL_LABELS, type Domain, type MandateLevel } from "@/lib/mandates/domains";

/**
 * De pure kern achter "Wat mag Wingman" (fase 2, punt 3 van de roadmap) —
 * zelfde opzet als gate() in src/lib/tools/permission.ts en
 * evaluateMandateSuggestion() in src/lib/mandates/suggest.ts: geen database,
 * geen netwerk, alleen een omzetting van al-opgehaalde feiten naar wat het
 * scherm toont. Zo is dit apart te testen zonder een draaiende Postgres.
 *
 * Dit bestand staat in de route-map van het scherm zelf, niet in
 * src/lib/mandates/ — die map wordt op dit moment door een andere opdracht
 * uitgebreid van 2 naar 9 domeinen, en dit scherm hoort daar niets aan toe te
 * voegen. Alles hieronder loopt daarom over `DOMAIN_REGISTRY` heen; er staat
 * nergens een eigen lijst met domein-namen.
 */

export interface WeekStats {
  gedaan: number;
  klaargezet: number;
  afgewezen: number;
  mislukt: number;
}

export const EMPTY_WEEK_STATS: WeekStats = { gedaan: 0, klaargezet: 0, afgewezen: 0, mislukt: 0 };

export function totalStats(stats: WeekStats): number {
  return stats.gedaan + stats.klaargezet + stats.afgewezen + stats.mislukt;
}

export interface ToolCallLite {
  tool: string;
  status: string;
}

/**
 * Toolnaam → domein, via de bestaande toolcatalogus (src/lib/tools/registry.ts)
 * — geen tweede lijst die uit de pas kan lopen. Zelfde aanpak als de private
 * `toolDomain()` in src/lib/mandates/suggest.ts, hier los herhaald omdat dat
 * bestand vanuit dit scherm niet aangeraakt mag worden. Een tool die niet meer
 * bestaat levert `undefined`: die call telt dan nergens voor mee in plaats van
 * de hele berekening te laten knappen.
 */
export function toolDomain(toolName: string): Domain | undefined {
  try {
    return findTool(toolName).tool.domain;
  } catch {
    return undefined;
  }
}

/**
 * Echte aantallen uit het ToolCall-logboek, per domein — de aanroeper bepaalt
 * het tijdvenster (de query levert alleen calls uit de afgelopen week aan).
 * Statussen buiten de vier bekende categorieën (bijvoorbeeld het kortstondige
 * "running", een call die middenin de aanroep zit) tellen nergens voor mee:
 * geen verzonnen vijfde categorie, en geen cijfer dat groter is dan wat er
 * echt gebeurd is.
 */
export function weeklyStatsByDomain(calls: ToolCallLite[]): Map<Domain, WeekStats> {
  const byDomain = new Map<Domain, WeekStats>();
  for (const call of calls) {
    const domain = toolDomain(call.tool);
    if (!domain) continue;
    const stats = byDomain.get(domain) ?? { ...EMPTY_WEEK_STATS };
    if (call.status === "done") stats.gedaan += 1;
    else if (call.status === "pending") stats.klaargezet += 1;
    else if (call.status === "rejected") stats.afgewezen += 1;
    else if (call.status === "failed") stats.mislukt += 1;
    byDomain.set(domain, stats);
  }
  return byDomain;
}

/**
 * Wat een niveau concreet betekent — generiek, dus zonder domeinnaam erin.
 * Zelfde matrix als gate() in src/lib/tools/permission.ts (lezen mag altijd;
 * het niveau bepaalt alleen wat er zonder jouw ja gebeurt), in gewone taal.
 */
export const LEVEL_UITLEG: Record<MandateLevel, string> = {
  1: "Wingman leest mee en signaleert. Voor een concept of een actie vraagt hij eerst iets aan jou.",
  2: "Wingman zet concepten zelfstandig klaar. Voor iets dat echt naar buiten gaat, vraagt hij eerst iets aan jou.",
  3: "Wingman handelt zelfstandig, ook als het naar buiten gaat.",
};

/**
 * Eén zin die de belofte van dit domein op dit niveau samenvat — de
 * domeinomschrijving uit het register plus wat het niveau daarbovenop
 * betekent. Geen score, geen badge: alleen wat er voor de gebruiker feitelijk
 * verandert.
 */
export function domainLevelText(domain: Domain, level: MandateLevel): string {
  return `${DOMAIN_REGISTRY[domain].description} ${LEVEL_UITLEG[level]}`;
}

export interface SuggestionEvidenceLike {
  dagen: number;
  calls: number;
}

/**
 * De zin bij een promotievoorstel (vertrouwensloop, fase 1) — zelfde tekst
 * als instellingen/page.tsx toont, hier los herhaald omdat dat scherm nu
 * elders in bewerking is en niet aangeraakt mag worden. Beide lezen dezelfde
 * MandateSuggestion-rij; dit is alleen de weergave, geen tweede beslissing.
 */
export function suggestionText(
  domain: Domain,
  evidence: SuggestionEvidenceLike,
  toLevel: MandateLevel,
): string {
  const weken = Math.max(1, Math.round(evidence.dagen / 7));
  const weekWoord = weken === 1 ? "week" : "weken";
  const actieWoord = evidence.calls === 1 ? "actie" : "acties";
  return `${DOMAIN_REGISTRY[domain].label} draait ${weken} ${weekWoord} zonder correcties (${evidence.calls} ${actieWoord}). Naar ${LEVEL_LABELS[toLevel]} tillen?`;
}

/** Parseert Mandate.rules (JSON, `{"notify": "melden"|"stil"}`) defensief. */
export function parseNotify(rawRules: string | null | undefined): string | undefined {
  if (!rawRules) return undefined;
  try {
    const parsed = JSON.parse(rawRules) as { notify?: unknown };
    return typeof parsed.notify === "string" ? parsed.notify : undefined;
  } catch {
    return undefined;
  }
}
