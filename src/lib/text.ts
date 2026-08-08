/**
 * Karakterbudgetten (§4A + Appendix B).
 *
 * Elk tekstslot dat door de LLM gevuld wordt is gebounded. Twee kanten:
 *  - de prompt krijgt het budget mee (zie src/brain/prompts.ts),
 *  - de UI kapt alsnog af, want een model houdt zich er niet altijd aan.
 *
 * Afkappen gebeurt op woordgrens met een echte ellipsis, nooit midden in een
 * woord. `clamp()` is puur; components hoeven niets te weten van limieten.
 */

export const BUDGET = {
  frogTitle: 40,
  frogSub: 140,
  frogImplement: 200,
  coach: 250,
  priority: 80,
  // De subregel onder een prioriteit wordt niet door de LLM geschreven maar
  // samengesteld uit party + opened_at. Toch een budget: hij komt van dezelfde
  // kant als frogSub en een lange partijnaam laat de regel anders omslaan.
  prioritySub: 120,
  looseEndTitle: 100,
  looseEndDescription: 200,
  transaction: 120,
  styleCardLine: 160,
  graphNodeTitle: 80,
  graphEdgeLabel: 30,
  connectorStatus: 120,
  inboxItem: 280,
  toolCallSummary: 120,
  // De onderwerpregel van een concept-mail (src/brain/propose.ts). Wordt
  // samengesteld uit Commitment.what, en dat veld komt uit de extractie — dus
  // uit het model, dus met een budget (regel 3). Ruim onder de 200 die de
  // Gmail-tool zelf toestaat, zodat "Re: " erbij past zonder te schuren.
  draftSubject: 180,
} as const;

export type BudgetKey = keyof typeof BUDGET;

export function clamp(text: string, key: BudgetKey): string {
  const max = BUDGET[key];
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** Voor server-side validatie: overschrijdt de LLM-output het budget? */
export function overBudget(text: string, key: BudgetKey): boolean {
  return text.trim().length > BUDGET[key];
}

/* ---------- Formatters (NL) ------------------------------------------- */

const TZ = "Europe/Amsterdam";

export function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function formatDayLong(d: Date | string): string {
  return new Date(d).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  });
}

export function formatDayShort(d: Date | string): string {
  return new Date(d).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "numeric",
    timeZone: TZ,
  });
}

export function formatAmount(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents);
}

/**
 * "26 dagen stil" — feitelijk, niet bestraffend (§3). Geen "!" en geen kleur;
 * de duur is het signaal.
 */
export function daysOpen(since: Date | string, now = new Date()): number {
  const ms = now.getTime() - new Date(since).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function durationPhrase(since: Date | string, now = new Date()): string {
  const d = daysOpen(since, now);
  if (d === 0) return "vandaag";
  if (d === 1) return "1 dag";
  return `${d} dagen`;
}
