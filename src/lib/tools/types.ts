import type { z } from "zod";
import {
  PERMISSION_LABELS,
  type AdapterContext,
  type ConnectorType,
  type Permission,
  type Provider,
} from "@/lib/types";
import type { Domain } from "@/lib/mandates/domains";

/**
 * Wat een connector kan dóén, naast lezen.
 *
 * Bewust géén verplichte CRUD-interface (search/read/write/list) op elke
 * adapter. "Schrijven" betekent bij Gmail iets anders dan bij een agenda en
 * iets heel anders dan bij een bank; een gedeelde write() dwingt vijf adapters
 * tot no-ops en de zesde tot liegen. In plaats daarvan: elke adapter mág nul of
 * meer tools aanbieden, elk met eigen parameters. Een bank hoeft er geen te
 * hebben en dat is geen gat in de implementatie — dat is het ontwerp (§6.7:
 * "bank = alleen lezen + categoriseren").
 */

/**
 * Wat een tool aanricht. Dit is de as waarlangs de permissiegradiënt uit §6.7
 * werkt — niet de naam van de tool en niet wie hem aanroept.
 *
 *  read   geen sporen buiten Wingman.
 *  draft  maakt iets omkeerbaars in het account van de gebruiker: een concept
 *         dat er staat tot hij het zelf verstuurt of weggooit.
 *  write  zichtbaar voor anderen of moeilijk terug te draaien: een afspraak in
 *         een agenda die ook bij de genodigden binnenkomt.
 */
export type ToolEffect = "read" | "draft" | "write";

export type { Permission };

export interface ConnectorTool<P = unknown> {
  /** "gmail.draft_reply" — provider-prefix, want namen moeten globaal uniek zijn. */
  name: string;
  /** Eén regel NL voor de instellingen: wat kan dit ding. */
  label: string;
  effect: ToolEffect;
  /**
   * Welk domein (src/lib/mandates/domains.ts) deze tool onder de mandaatvraag
   * zet. Verplicht: een tool zonder domein is een actie die gate() nergens aan
   * kan toetsen, en dat mag niet stilzwijgend "geen mandaat nodig" betekenen.
   */
  domain: Domain;
  /** Parameters gaan er nooit ongecontroleerd in; een model verzint velden. */
  params: z.ZodType<P>;
  /**
   * De zin die de gebruiker leest bij de goedkeuringsvraag. De tool maakt hem,
   * niet de UI: alleen de tool weet wat er werkelijk gaat gebeuren. Houd 'm
   * feitelijk en zonder gevoelige details — hij kan in een notificatie belanden.
   */
  describe(params: P): string;
  run(ctx: AdapterContext, params: P): Promise<unknown>;
}

/**
 * Een tool waarvan de parameters pas bij het parsen bekend worden.
 *
 * `ConnectorTool<unknown>` kan hier niet: `params: z.ZodType<P>` maakt P
 * covariant, dus een `ConnectorTool<{title: string}>` past niet in een lijst van
 * `ConnectorTool<unknown>`. Dit is het bekende gat waar TypeScript geen
 * existentiële types heeft. De `any` blijft binnen dit bestand betekenisloos:
 * elke aanroep gaat eerst door `params.safeParse()` heen, dus wat de tool
 * binnenkrijgt is gevalideerd, ongeacht wat het type hier zegt.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ConnectorTool<any>;

/** Adapter + tool, zoals de registry ze teruggeeft. */
export interface ResolvedTool {
  tool: AnyTool;
  provider: Provider;
  type: ConnectorType;
}

/* ---------- Fouten ------------------------------------------------------ */

/**
 * Eén foutvorm voor alle connectors. De reden is niet netheid: de UI moet
 * kunnen zeggen "je Gmail-koppeling is verlopen, verbind opnieuw" in plaats van
 * "Error: HTTP 401", en de briefing moet weten dat dit een degraded bron is
 * (rule 2 in CLAUDE.md). Daarom een code die overleeft tot in de database.
 */
export type ToolErrorCode =
  | "ToolNotFound"
  | "ConnectorOffline"
  | "Authentication"
  | "Permission"
  | "InvalidParams"
  | "RateLimit"
  | "Timeout"
  | "ToolFailed";

export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
    /** Wat de gebruiker moet doen. Leeg = niets, het ligt niet aan hem. */
    readonly remedy?: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export const toolErrors = {
  notFound: (name: string) =>
    new ToolError("ToolNotFound", `Onbekende tool: ${name}`),

  offline: (label: string) =>
    new ToolError(
      "ConnectorOffline",
      `${label} is niet verbonden.`,
      "Koppel de bron opnieuw in instellingen.",
    ),

  auth: (label: string) =>
    new ToolError(
      "Authentication",
      `De koppeling met ${label} is verlopen.`,
      "Verbind opnieuw in instellingen.",
    ),

  permission: (label: string, permission: Permission, effect: ToolEffect) =>
    new ToolError(
      "Permission",
      `${label} staat op "${PERMISSION_LABELS[permission]}" — ${
        effect === "read" ? "lezen" : effect === "draft" ? "concepten maken" : "zelf handelen"
      } mag daarmee niet.`,
      "Pas de permissie aan in instellingen.",
    ),

  invalidParams: (detail: string) =>
    new ToolError("InvalidParams", `Parameters kloppen niet: ${detail}`),

  rateLimit: (label: string) =>
    new ToolError("RateLimit", `${label} houdt de aanvraag tegen (te veel verkeer).`, "Probeer later opnieuw."),

  timeout: (label: string, ms: number) =>
    new ToolError("Timeout", `${label} reageerde niet binnen ${ms / 1000} seconden.`),

  failed: (label: string, detail: string) =>
    new ToolError("ToolFailed", `${label}: ${detail}`),
} as const;
