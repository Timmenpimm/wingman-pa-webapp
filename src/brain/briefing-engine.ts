import { prisma } from "@/lib/db/client";
import { localDateKey, dateKeyToUtc, localDayRange } from "@/lib/day";
import { clamp } from "@/lib/text";
import type { BriefingToday } from "@/lib/types";

/**
 * Stelt het Vandaag-scherm samen (§6.1).
 *
 * Twee productregels zitten hier hard in, niet in de UI:
 *  1. Nooit meer dan 3 prioriteiten — ook als er 20 open staan (§3).
 *  2. Een onvolledige briefing zegt dat zelf. Als een connector eruit lag,
 *     komt dat als `degraded` mee, want je moet dat weten vóórdat je op het
 *     beeld vertrouwt (§6.7).
 *
 * De LLM schrijft de teksten (frog, coachregel) in de nachtelijke run; dit
 * leest wat er ligt en kapt af op budget. Nooit tekst genereren tijdens een
 * page load — dat maakt het scherm traag en onvoorspelbaar.
 */

export const MAX_PRIORITIES = 3;

export async function getBriefingToday(
  userId: string,
  opts: { date?: Date; forceState?: BriefingToday["state"] } = {},
): Promise<BriefingToday> {
  // De dag wordt bepaald in de tijdzone van de gebruiker, niet die van de
  // server. Anders krijgt iemand in Amsterdam tussen middernacht en 02:00 de
  // briefing van gisteren te zien — de server staat immers op UTC.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timezone = user?.timezone ?? "Europe/Amsterdam";
  const now = opts.date ?? new Date();

  const dateKey = localDateKey(timezone, now);
  const date = dateKeyToUtc(dateKey);
  const day = localDayRange(timezone, now);

  const [briefing, events, connectors] = await Promise.all([
    prisma.dailyBriefing.findFirst({ where: { user_id: userId, date } }),
    prisma.event.findMany({
      where: { user_id: userId, start_at: { gte: day.start, lt: day.end } },
      orderBy: { start_at: "asc" },
    }),
    prisma.connector.findMany({ where: { user_id: userId } }),
  ]);

  const degraded = connectors
    .filter((c) => c.status === "error" || c.status === "reauth_required")
    .map((c) => ({
      connector: c.label,
      message: clamp(
        c.error_message ??
          (c.status === "reauth_required"
            ? `${c.label} vraagt opnieuw toestemming. Deze briefing mist die bron.`
            : `${c.label} was niet bereikbaar. Deze briefing mist die bron.`),
        "connectorStatus",
      ),
    }));

  if (!briefing) {
    return {
      date: dateKey,
      frog: null,
      coach_text: "",
      priorities: [],
      timeline: toTimeline(events),
      confirmations: [],
      degraded,
      state: "empty",
    };
  }

  const priorities = (JSON.parse(briefing.priorities) as Priority[])
    .slice(0, MAX_PRIORITIES)
    .map((p) => ({ ...p, text: clamp(p.text, "priority") }));

  const confirmations = (JSON.parse(briefing.confirmations) as Confirmation[]).map((c) => ({
    ...c,
    text: clamp(c.text, "looseEndTitle"),
  }));

  const allDone =
    briefing.frog_status !== "open" &&
    priorities.every((p) => p.done) &&
    confirmations.every((c) => c.answered);

  return {
    date: dateKey,
    frog: {
      id: briefing.id,
      title: clamp(briefing.frog_title, "frogTitle"),
      sub: briefing.frog_sub ? clamp(briefing.frog_sub, "frogSub") : undefined,
      implement: briefing.frog_implement
        ? clamp(briefing.frog_implement, "frogImplement")
        : undefined,
      status: briefing.frog_status as "open" | "done" | "deferred",
    },
    coach_text: clamp(briefing.coach_text, "coach"),
    priorities,
    timeline: toTimeline(events),
    confirmations,
    degraded,
    state:
      opts.forceState ??
      (degraded.length > 0 ? "degraded" : allDone ? "clear" : "normal"),
  };
}

/**
 * Conflicten markeren we in de tijdlijn zelf, niet met een rode kleur ergens
 * anders in de UI (§7). Twee blokken die overlappen krijgen elkaars titel te
 * zien — dat is genoeg informatie om te handelen.
 */
function toTimeline(events: EventRow[]): BriefingToday["timeline"] {
  return events.map((e) => {
    const clash = events.find(
      (o) => o.id !== e.id && o.start_at < e.end_at && o.end_at > e.start_at,
    );
    // Privéblokken tonen geen titel (de privé-agenda is alleen-lezen). Twee
    // privéblokken tegen elkaar zou dan "Privé overlapt met Privé" opleveren —
    // waar niemand iets aan heeft. Dan liever benoemen dát er twee dingen staan.
    const conflictLabel = clash
      ? clash.is_private
        ? e.is_private
          ? "er staat nog een blok op dit tijdstip"
          : "een privéblok"
        : clash.title
      : undefined;

    return {
      id: e.id,
      start: e.start_at.toISOString(),
      end: e.end_at.toISOString(),
      title: e.is_private ? "Privé" : e.title,
      conflict_with: conflictLabel,
      is_private: e.is_private,
    };
  });
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

type Priority = { id: string; text: string; done: boolean };
type Confirmation = { id: string; text: string; answered: boolean };
type EventRow = {
  id: string;
  title: string;
  start_at: Date;
  end_at: Date;
  is_private: boolean;
};
