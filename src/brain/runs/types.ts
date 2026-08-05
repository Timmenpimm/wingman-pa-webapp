import type { Tx } from "@/lib/db/with-user";

/**
 * Wat een recept oplevert.
 *
 * `null` is een geldige uitkomst en niet een fout: het middagmoment hoort te
 * zwijgen op een dag zonder afwijking. Een run die dan tóch iets stuurt maakt
 * van drie momenten drie meldingen die je wegveegt.
 */
export interface RunResult {
  /** Eén regel, voor de meldingsregel en het logboek. Max 120 tekens. */
  summary: string;
  /** De inhoud van het bericht. Leeg = alleen de samenvatting sturen. */
  detail?: string;
  /**
   * Bevat dit bericht gegevens die niet in een melding horen (bedragen,
   * namen van instanties)? De instelling "stuur geen gevoelige details"
   * bepaalt dan of de inhoud meegaat of alleen "er is iets".
   */
  sensitive?: boolean;
}

export type Recipe = (
  tx: Tx,
  userId: string,
  localDate: string,
  now: Date,
) => Promise<RunResult | null>;
