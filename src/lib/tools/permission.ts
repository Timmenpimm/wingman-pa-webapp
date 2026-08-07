import type { ConnectorHealth } from "@/lib/types";
import type { MandateLevel, NotifyPreference } from "@/lib/mandates/domains";
import { toolErrors, type ToolEffect, type ToolError } from "./types";

/**
 * De poort. Elke tool-aanroep komt hier langs, ook die van de gebruiker zelf.
 *
 * Fase 1 van het mandaatmodel: de vier standen per connector (propose/draft/
 * act_and_report/silent) zijn vervangen door drie niveaus per domein
 * (src/lib/mandates/domains.ts). Deze functie blijft met opzet een pure
 * functie: geen database, geen netwerk, geen sessie. Een regel die je kunt
 * uittesten is een regel die je kunt vertrouwen.
 */

export type GateVerdict =
  | { allow: true; requiresApproval: boolean; notify: boolean }
  | { allow: false; error: ToolError };

interface GateInput {
  connectorLabel: string;
  connectorStatus: ConnectorHealth["status"];
  level: MandateLevel;
  effect: ToolEffect;
  /** Voorkeur uit Mandate.rules — alleen van belang bij niveau 3. */
  notifyPreference: NotifyPreference;
}

/**
 * De matrix (rij = niveau, kolom = effect):
 *
 *                    read    draft      write
 *   1 signaleren      ja     vragen     vragen
 *   2 klaarzetten     ja     ja         vragen
 *   3 doen             ja     ja         ja (+ melden als notifyPreference "melden" is)
 *
 * Twee dingen die niet vanzelf spreken:
 *
 * 1. "vragen" is geen weigering. Bij niveau 1 mag Wingman alles, mits de
 *    gebruiker per keer ja zegt — dat is precies wat "signaleren" betekent.
 *    Een harde nee zou de stand onbruikbaar maken: je kunt dan niets meer
 *    accepteren zonder eerst naar instellingen te lopen.
 *
 * 2. Lezen mag in elke stand. Het mandaat gaat over handelen namens de
 *    gebruiker; een bron die je koppelt, mag je lezen. Wie dat niet wil,
 *    koppelt hem niet — dat is de echte knop.
 */
export function gate(input: GateInput): GateVerdict {
  const { connectorLabel, connectorStatus, level, effect, notifyPreference } = input;

  // Eerst de staat van de connector, dan pas het mandaat. Een verlopen token
  // is geen mandaatkwestie en moet ook niet zo klinken.
  if (connectorStatus === "not_connected") {
    return { allow: false, error: toolErrors.offline(connectorLabel) };
  }
  if (connectorStatus === "reauth_required") {
    return { allow: false, error: toolErrors.auth(connectorLabel) };
  }
  // Een bron in `error` mag je nog uitlezen — de laatste sync faalde, dat maakt
  // een leespoging niet gevaarlijk. Handelen op een bron waarvan we de staat
  // niet kennen, is dat wel: dan weet je niet of je een dubbele afspraak zet.
  if (connectorStatus === "error" && effect !== "read") {
    return { allow: false, error: toolErrors.offline(connectorLabel) };
  }

  if (effect === "read") {
    return { allow: true, requiresApproval: false, notify: false };
  }

  const autonomy: Record<MandateLevel, ToolEffect[]> = {
    1: [],
    2: ["draft"],
    3: ["draft", "write"],
  };

  const mayActAlone = autonomy[level].includes(effect);

  return {
    allow: true,
    requiresApproval: !mayActAlone,
    // Alleen niveau 3 met de voorkeur "melden" meldt ongevraagd. Wat de
    // gebruiker net zelf heeft goedgekeurd (niveau 1 en 2), hoeft hij niet nog
    // eens te horen; "stil" is de voorkeur waarin hij expliciet zei het niet
    // te willen horen.
    notify: mayActAlone && level === 3 && notifyPreference === "melden",
  };
}
