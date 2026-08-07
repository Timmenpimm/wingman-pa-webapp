import type { MandateLevel, NotifyPreference } from "./domains";

/**
 * De afleidingsregel achter de datamigratie (prisma/migrations/*_mandates).
 *
 * De migratie zelf is handgeschreven SQL — er is geen lokale db om hem tegen
 * te draaien (zie CLAUDE.md, "Dev"), dus geen `prisma migrate dev` die dit voor
 * je test. Deze functie is de vertaalslag in TypeScript, apart getest
 * (tests/tools.test.ts), zodat de regel die de SQL straks uitvoert eerst hier
 * klopt. De SQL herhaalt dezelfde CASE-logica handmatig; verandert deze
 * functie, dan moet de migratie-SQL voor nieuwe rijen (na deze migratie) hier
 * niet meer op leunen — hij draait immers maar één keer.
 */

export interface DerivedMandate {
  level: MandateLevel;
  notify: NotifyPreference;
}

/** propose→1, draft→2, act_and_report→3 (melden), silent→3 (stil). */
export function deriveMandateFromPermission(permission: string): DerivedMandate {
  switch (permission) {
    case "draft":
      return { level: 2, notify: "melden" };
    case "act_and_report":
      return { level: 3, notify: "melden" };
    case "silent":
      return { level: 3, notify: "stil" };
    case "propose":
    default:
      return { level: 1, notify: "melden" };
  }
}

/**
 * Twee connectors op hetzelfde domein — de een op "voorstellen", de ander op
 * "stil doen". Het voorzichtigste niveau wint (laagste getal). Bij een
 * gelijkspel in niveau wint "melden": dat is de voorzichtigste keuze in
 * meldingstermen, en een migratie die stilzwijgend "stil" laat winnen zou een
 * gebruiker die van geen van beide connectors "stil doen" koos, alsnog stil
 * zetten.
 */
export function combineMandates(a: DerivedMandate, b: DerivedMandate): DerivedMandate {
  if (a.level !== b.level) return a.level < b.level ? a : b;
  if (a.notify === "melden" || b.notify === "melden") return { level: a.level, notify: "melden" };
  return a;
}
