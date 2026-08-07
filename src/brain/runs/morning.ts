import { dateKeyToUtc, localDayRange } from "@/lib/day";
import { clamp, durationPhrase } from "@/lib/text";
import { MAX_PRIORITIES } from "@/brain/briefing-engine";
import type { Recipe } from "./types";

/**
 * Ochtend — de dag klaarzetten.
 *
 * Kiest de frog uit wat écht vastzit, niet uit wat het makkelijkst is: de
 * oudste openstaande belofte waar de bal bij de gebruiker ligt. Dat is precies
 * de taak die anders weer een dag doorschuift.
 *
 * De teksten worden hier samengesteld uit de data. In productie schrijft het
 * model ze (zie src/brain/prompts.ts); tot die tijd is een feitelijke,
 * saaie regel beter dan een verzonnen enthousiaste.
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

  await tx.dailyBriefing.create({
    data: {
      user_id: userId,
      date: dateKeyToUtc(localDate),
      frog_title: clamp(frog.what, "frogTitle"),
      frog_sub: clamp(
        `${frog.party} wacht hier ${durationPhrase(frog.opened_at, now)} op. ${frog.context ?? ""}`,
        "frogSub",
      ),
      coach_text: clamp(
        mijnBeurt.length > 3
          ? `Er staan ${mijnBeurt.length} beloftes open waar jij aan zet bent. De oudste hangt ${durationPhrase(frog.opened_at, now)} — dat is geen tijdgebrek, die komt telkens net niet aan de beurt.`
          : `Eén ding vandaag: ${frog.party}. De rest kan wachten.`,
        "coach",
      ),
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
