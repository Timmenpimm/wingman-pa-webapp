import { dateKeyToUtc, localDayRange } from "@/lib/day";
import { clamp } from "@/lib/text";
import type { Recipe } from "./types";

/**
 * Middag — alleen bijsturen.
 *
 * Dit is het enige moment dat mag zwijgen, en dat is de kern ervan. Het kijkt
 * of er sinds vanochtend iets is dat de frog achterhaalt: een deadline die
 * vandaag verloopt, nieuwe losse invoer, of een bron die eruit ligt waardoor
 * het beeld onvolledig is. Is er niets, dan gebeurt er niets — een bijsturing
 * op een dag zonder afwijking is ruis.
 */
export const midday: Recipe = async (tx, userId, localDate, now) => {
  const briefing = await tx.dailyBriefing.findFirst({
    where: { user_id: userId, date: dateKeyToUtc(localDate) },
  });

  const user = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const dag = localDayRange(user?.timezone ?? "Europe/Amsterdam", now);

  const [vandaagDeadline, nieuweInvoer, kapotteBronnen, restAgenda] = await Promise.all([
    tx.commitment.findMany({
      where: { user_id: userId, status: "open", due_date: { gte: dag.start, lt: dag.end } },
    }),
    tx.inboxItem.count({ where: { user_id: userId, status: "new" } }),
    tx.connector.findMany({
      where: { user_id: userId, status: { in: ["error", "reauth_required"] } },
      select: { label: true },
    }),
    tx.event.findMany({
      where: { user_id: userId, start_at: { gte: now, lt: dag.end } },
      orderBy: { start_at: "asc" },
    }),
  ]);

  const frogOpen = briefing ? briefing.frog_status === "open" : false;
  const redenen: string[] = [];

  if (vandaagDeadline.length > 0) {
    redenen.push(
      `${vandaagDeadline.length === 1 ? "Eén afspraak verloopt" : `${vandaagDeadline.length} afspraken verlopen`} vandaag: ${vandaagDeadline.map((c) => c.what).join(", ")}.`,
    );
  }
  if (frogOpen && restAgenda.length === 0) {
    redenen.push(`Je frog staat nog open en je agenda is verder leeg: ${briefing?.frog_title}.`);
  }
  if (nieuweInvoer >= 3) {
    redenen.push(`${nieuweInvoer} dingen in je inbox wachten op een plek.`);
  }
  if (kapotteBronnen.length > 0) {
    redenen.push(
      `${kapotteBronnen.map((c) => c.label).join(" en ")} ligt eruit — je beeld is onvolledig.`,
    );
  }

  // Niets bijzonders: dan ook niets sturen. Dit is geen ontbrekende functie.
  if (redenen.length === 0) return null;

  return {
    summary: clamp(redenen[0], "connectorStatus"),
    detail: redenen.join("\n"),
  };
};
