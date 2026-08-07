import type { ToolEffect } from "@/lib/tools/types";

/**
 * De degradatieregel (vertrouwensloop, fase 1): "vertrouwen groeit door
 * controleerbaarheid" werkt ook omgekeerd. Puur, zoals gate() in
 * src/lib/tools/permission.ts — geen database, geen netwerk, alleen de
 * beslissing.
 *
 * Alleen een `write` die zelfstandig liep (het mandaat stond op niveau 3, er
 * was dus geen per-actie-goedkeuring) hoort het mandaat terug te zetten als
 * de uitvoering bij de bron mislukt: Wingman handelde zonder te vragen en de
 * buitenwereld is mogelijk geraakt. Een `write` die de gebruiker net zelf
 * goedkeurde (niveau 1 of 2, `ranAutonomously` is dan false) faalde met
 * instemming vooraf — dat is geen reden om het mandaat te verlagen.
 *
 * `ranAutonomously` is precies `!requiresApproval` uit het GateVerdict van
 * gate(): per de matrix in permission.ts is een write alleen autonoom bij
 * niveau 3, dus deze functie hoeft dat niveau zelf niet opnieuw te
 * controleren — de combinatie effect="write" + ranAutonomously impliceert
 * het al.
 */
export function shouldDegradeOnFailure(effect: ToolEffect, ranAutonomously: boolean): boolean {
  return effect === "write" && ranAutonomously;
}
