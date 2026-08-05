import type { ConnectorHealth } from "@/lib/types";
import { toolErrors, type Permission, type ToolEffect, type ToolError } from "./types";

/**
 * De poort. Elke tool-aanroep komt hier langs, ook die van de gebruiker zelf.
 *
 * Er stond al een permissiegradiënt per connector in de database (§6.7), maar
 * niets dwong hem af — het was een keuze in een formulier die nergens gelezen
 * werd. Deze functie is de plek waar dat veld betekenis krijgt, en het is met
 * opzet een pure functie: geen database, geen netwerk, geen sessie. Een regel
 * die je kunt uittesten is een regel die je kunt vertrouwen.
 */

export type GateVerdict =
  | { allow: true; requiresApproval: boolean; notify: boolean }
  | { allow: false; error: ToolError };

interface GateInput {
  connectorLabel: string;
  connectorStatus: ConnectorHealth["status"];
  permission: Permission;
  effect: ToolEffect;
}

/**
 * De matrix (rij = permissie, kolom = effect):
 *
 *                   read    draft      write
 *   voorstellen      ja     vragen     vragen
 *   concept maken    ja     ja         vragen
 *   doen en melden   ja     ja         ja + melden
 *   stil doen        ja     ja         ja
 *
 * Twee dingen die niet vanzelf spreken:
 *
 * 1. "vragen" is geen weigering. Bij "voorstellen" mag Wingman alles, mits de
 *    gebruiker per keer ja zegt — dat is precies wat voorstellen betekent. Een
 *    harde nee zou de stand onbruikbaar maken: je kunt dan niets meer accepteren
 *    zonder eerst naar instellingen te lopen.
 *
 * 2. Lezen mag in elke stand. De permissiegradiënt gaat over handelen namens de
 *    gebruiker; een bron die je koppelt, mag je lezen. Wie dat niet wil, koppelt
 *    hem niet — dat is de echte knop.
 */
export function gate(input: GateInput): GateVerdict {
  const { connectorLabel, connectorStatus, permission, effect } = input;

  // Eerst de staat van de connector, dan pas de wens van de gebruiker. Een
  // verlopen token is geen permissiekwestie en moet ook niet zo klinken.
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

  const autonomy: Record<Permission, ToolEffect[]> = {
    propose: [],
    draft: ["draft"],
    act_and_report: ["draft", "write"],
    silent: ["draft", "write"],
  };

  const mayActAlone = autonomy[permission].includes(effect);

  return {
    allow: true,
    requiresApproval: !mayActAlone,
    // Alleen "doen en melden" meldt ongevraagd. Wat de gebruiker net zelf heeft
    // goedgekeurd, hoeft hij niet nog eens te horen; "stil doen" is de stand
    // waarin hij expliciet zei het niet te willen horen.
    notify: mayActAlone && permission === "act_and_report",
  };
}

/** Alleen deze vier zijn geldig; de database bewaart een vrije string. */
export function asPermission(value: string): Permission {
  return value === "draft" || value === "act_and_report" || value === "silent" ? value : "propose";
}
