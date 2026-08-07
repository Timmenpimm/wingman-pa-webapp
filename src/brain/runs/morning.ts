import { dateKeyToUtc, localDayRange } from "@/lib/day";
import { clamp, daysOpen, durationPhrase } from "@/lib/text";
import { MAX_PRIORITIES } from "@/brain/briefing-engine";
import { coachPrompt, MODELS } from "@/brain/prompts";
import { callAnthropic, type LlmCaller } from "@/brain/llm";
import type { Recipe } from "./types";

/**
 * Ochtend — de dag klaarzetten.
 *
 * Kiest de frog uit wat écht vastzit, niet uit wat het makkelijkst is: de
 * oudste openstaande belofte waar de bal bij de gebruiker ligt. Dat is precies
 * de taak die anders weer een dag doorschuift. Die keuze staat hard in code —
 * het model schrijft alleen de tekst erover, het kiest niet welke belofte het
 * is.
 *
 * Tekst: Sonnet (coachPrompt) schrijft frog_title/frog_sub/coach_text. Bij
 * elke fout — geen key, HTTP-fout, kapotte JSON — valt dit terug op exact de
 * oude heuristiek (`heuristicText`). De briefing mag nooit uitblijven omdat
 * een API hapert (CLAUDE.md: "geen LLM-calls tijdens een page load" geldt
 * hier niet — dit is de nachtelijke run zelf — maar een falende aanroep mag
 * hem ook niet laten mislukken).
 */
export const morning: Recipe = async (tx, userId, localDate, now) => {
  const bestaat = await tx.dailyBriefing.findFirst({
    where: { user_id: userId, date: dateKeyToUtc(localDate) },
  });
  if (bestaat) {
    return {
      summary: clamp(`Je briefing van vandaag staat klaar: ${bestaat.frog_title}`, "connectorStatus"),
    };
  }

  const open = await tx.commitment.findMany({
    where: { user_id: userId, status: "open" },
    orderBy: { opened_at: "asc" },
  });
  const mijnBeurt = open.filter((c) => c.direction === "i_owe");

  if (mijnBeurt.length === 0) {
    return {
      summary: "Niets dat vastzit. Vandaag is van jou.",
      detail: "Er ligt geen belofte open waar jij aan zet bent. Dat is een goede stand.",
    };
  }

  const frog = mijnBeurt[0];
  const rest = mijnBeurt.slice(1, 1 + MAX_PRIORITIES);

  const user = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const dag = localDayRange(user?.timezone ?? "Europe/Amsterdam", now);
  const events = await tx.event.findMany({
    where: { user_id: userId, start_at: { gte: dag.start, lt: dag.end } },
    orderBy: { start_at: "asc" },
  });

  const tekst = await schrijfCoachTekst({
    llmCall: callAnthropic,
    openCommitments: mijnBeurt.map((c) => ({
      what: c.what,
      party: c.party,
      days: daysOpen(c.opened_at, now),
      direction: c.direction,
    })),
    todayEvents: events.map((e) => ({ title: e.title, start: e.start_at.toISOString() })),
    fallback: heuristicText(frog, mijnBeurt.length, now),
  });

  await tx.dailyBriefing.create({
    data: {
      user_id: userId,
      date: dateKeyToUtc(localDate),
      frog_title: clamp(tekst.frog_title, "frogTitle"),
      frog_sub: clamp(tekst.frog_sub, "frogSub"),
      coach_text: clamp(tekst.coach_text, "coach"),
      priorities: JSON.stringify(
        rest.map((c) => ({
          id: c.id,
          text: clamp(c.what, "priority"),
          // Wie wacht en hoe lang al. Dezelfde samenstelling als frog_sub —
          // feitelijk, uit de data, niet door een model verzonnen.
          sub: clamp(`${c.party} wacht ${durationPhrase(c.opened_at, now)}`, "prioritySub"),
          when: termijn(c.due_date, dag.start),
          done: false,
        })),
      ),
      confirmations: "[]",
      degraded: "[]",
    },
  });

  return {
    summary: clamp(`Vandaag één ding: ${frog.what}`, "connectorStatus"),
    detail: [
      `${frog.what} — ${frog.party}, ${durationPhrase(frog.opened_at, now)} open.`,
      rest.length > 0 ? `Daarna: ${rest.map((c) => c.what).join(", ")}.` : "",
      events.length > 0 ? `${events.length} blokken in je agenda vandaag.` : "Je agenda is leeg.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
};

/** Wat de coachregel nodig heeft — frog_title/frog_sub/coach_text, allemaal ongeclampt (dat doet de aanroeper). */
export interface CoachTekst {
  frog_title: string;
  frog_sub: string;
  coach_text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Pure: valideert het modelantwoord. Ontbrekend of leeg veld → afkeuren, niet aanvullen met giswerk. */
export function parseCoachJson(json: unknown): CoachTekst | null {
  if (!isRecord(json)) return null;
  const { frog_title, frog_sub, coach_text } = json;
  if (typeof frog_title !== "string" || !frog_title.trim()) return null;
  if (typeof frog_sub !== "string" || !frog_sub.trim()) return null;
  if (typeof coach_text !== "string" || !coach_text.trim()) return null;
  return { frog_title, frog_sub, coach_text };
}

/**
 * De oude, feitelijke tekst — nu de fallback in plaats van de enige uitkomst.
 * Precies wat er stond vóór het model erbij kwam: geen verzonnen enthousiasme,
 * gewoon wie wacht en hoelang.
 */
export function heuristicText(
  frog: { what: string; party: string; opened_at: Date; context: string | null },
  mijnBeurtCount: number,
  now: Date,
): CoachTekst {
  return {
    frog_title: frog.what,
    frog_sub: `${frog.party} wacht hier ${durationPhrase(frog.opened_at, now)} op. ${frog.context ?? ""}`,
    coach_text:
      mijnBeurtCount > 3
        ? `Er staan ${mijnBeurtCount} beloftes open waar jij aan zet bent. De oudste hangt ${durationPhrase(frog.opened_at, now)} — dat is geen tijdgebrek, die komt telkens net niet aan de beurt.`
        : `Eén ding vandaag: ${frog.party}. De rest kan wachten.`,
  };
}

/**
 * Roept het model aan voor de coachregel; valt bij elke fout terug op
 * `fallback`. `llmCall` is injecteerbaar (net als `LlmCaller` in
 * src/brain/extract-commitments.ts) zodat dit zonder netwerk te testen is.
 */
export async function schrijfCoachTekst(params: {
  llmCall: LlmCaller;
  openCommitments: Array<{ what: string; party: string; days: number; direction: string }>;
  todayEvents: Array<{ title: string; start: string }>;
  fallback: CoachTekst;
}): Promise<CoachTekst> {
  try {
    const result = await params.llmCall({
      prompt: coachPrompt({
        openCommitments: params.openCommitments,
        todayEvents: params.todayEvents,
        // Nog niet aangeleverd door een eerdere stap in deze fase — leeg is
        // een geldige invoer voor de prompt, geen fout.
        yesterdayUnanswered: [],
        patterns: [],
      }),
      model: MODELS.coach,
      maxTokens: 600,
    });
    if (!result.ok) return params.fallback;
    return parseCoachJson(result.json) ?? params.fallback;
  } catch {
    return params.fallback;
  }
}

/**
 * Wanneer iets moet, als termijn in plaats van als datum. "Woensdag" dwingt
 * de lezer tot rekenen; "morgen" niet. Zonder einddatum blijft het leeg — dan
 * is er niets te zeggen en is een verzonnen termijn erger dan geen.
 */
function termijn(
  due: Date | null,
  dagStart: Date,
): "vandaag" | "morgen" | "deze week" | "later" | undefined {
  if (!due) return undefined;
  const dagen = Math.floor((+due - +dagStart) / 86_400_000);
  if (dagen <= 0) return "vandaag";
  if (dagen === 1) return "morgen";
  if (dagen <= 7) return "deze week";
  return "later";
}
