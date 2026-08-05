import { dateKeyToUtc } from "@/lib/day";
import { clamp, durationPhrase } from "@/lib/text";
import type { Recipe } from "./types";

/**
 * Avond — afsluiten, en morgen voorbereiden.
 *
 * Wat vandaag open bleef wordt de "nog te bevestigen"-lijst van morgen (§6.1).
 * Dat blok is de belangrijkste interactie in de app, en dit is waar het
 * gevuld wordt: niet met wat de gebruiker moet, maar met wat wij niet zeker
 * weten.
 */
export const evening: Recipe = async (tx, userId, localDate, now) => {
  const vandaag = await tx.dailyBriefing.findFirst({
    where: { user_id: userId, date: dateKeyToUtc(localDate) },
  });
  if (!vandaag) {
    return { summary: "Geen briefing vandaag — niets af te sluiten." };
  }

  const prios = JSON.parse(vandaag.priorities) as Array<{ id: string; text: string; done: boolean }>;
  const openPrios = prios.filter((p) => !p.done);
  const frogOpen = vandaag.frog_status === "open";

  const teBevestigen = [
    ...(frogOpen ? [{ id: `frog-${localDate}`, text: `${vandaag.frog_title} — is dat gelukt?`, answered: false }] : []),
    ...openPrios.map((p) => ({ id: `prio-${p.id}`, text: `${p.text} — afgerond?`, answered: false })),
  ].slice(0, 3);

  // Morgen bestaat nog niet; de vragen worden bewaard tot de ochtendrun de
  // briefing aanmaakt. Daarom worden ze op de briefing van vandaag gezet en
  // door de ochtendrun overgenomen — één plek, geen tweede tabel.
  await tx.dailyBriefing.update({
    where: { id: vandaag.id },
    data: { confirmations: JSON.stringify(teBevestigen) },
  });

  const nogOpen = await tx.commitment.count({ where: { user_id: userId, status: "open" } });

  if (teBevestigen.length === 0) {
    return {
      summary: "Alles van vandaag is afgehandeld.",
      detail:
        nogOpen > 0
          ? `Niets meer open van vandaag. Er hangen nog ${nogOpen} losse eindjes, maar die zijn niet van nu.`
          : "Niets meer open, nergens. De avond is van jou.",
    };
  }

  const oudste = await tx.commitment.findFirst({
    where: { user_id: userId, status: "open", direction: "i_owe" },
    orderBy: { opened_at: "asc" },
  });

  return {
    summary: clamp(
      `${teBevestigen.length} ding${teBevestigen.length === 1 ? "" : "en"} van vandaag nog te bevestigen`,
      "connectorStatus",
    ),
    detail: [
      teBevestigen.map((c) => `· ${c.text}`).join("\n"),
      oudste
        ? `\nDe oudste draad hangt inmiddels ${durationPhrase(oudste.opened_at, now)}: ${oudste.what}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
};
