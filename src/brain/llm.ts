/**
 * Dunne fetch-wrapper naar de Anthropic Messages API. Geen SDK — geen nieuwe
 * dependency voor twee aanroepen (extractie, coachregel).
 *
 * Twee lagen, dezelfde scheiding als src/lib/auth/google-token.ts:
 *  - `extractJsonText`/`firstJsonBlock` zijn puur en zonder netwerk te testen.
 *  - `callAnthropic` is de dunne onzuivere laag die fetch aanroept en die
 *    twee samenvoegt tot één resultaat.
 *
 * Ontbreekt ANTHROPIC_API_KEY, dan geeft `callAnthropic` een duidelijke
 * "niet geconfigureerd"-uitkomst terug in plaats van te crashen — de
 * aanroeper (extractie, coachregel) valt dan terug op heuristiek. Zie
 * CLAUDE.md-regel 3 en het advies "de briefing mag nooit uitblijven omdat
 * een API hapert".
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export type LlmFailureReason = "not_configured" | "http_error" | "parse_error";

export type LlmResult =
  | { ok: true; json: unknown }
  | { ok: false; reason: LlmFailureReason; message: string };

export interface LlmCallParams {
  prompt: string;
  model: string;
  maxTokens: number;
}

export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Zoekt het eerste gebalanceerde `{...}`-blok in tekst en parset dat als
 * JSON. Modellen zetten er soms een zin omheen ("Hier is het antwoord: {...}")
 * ondanks een expliciete instructie — dit vangt dat op zonder de hele tekst
 * te hoeven parsen. Houdt rekening met accolades binnen strings, zodat een
 * `"what": "iets met een { erin"` het blok niet vroegtijdig afsluit.
 */
export function firstJsonBlock(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null; // nooit gesloten — onvolledig antwoord (bv. afgekapt op max_tokens)
}

/** Pure: haalt de tekst uit de content-blocks van een Messages-API-antwoord. */
export function extractResponseText(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.content)) return null;
  const parts = body.content
    .filter((block): block is { type: string; text: string } => isRecord(block) && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text);
  if (parts.length === 0) return null;
  return parts.join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Roept het model aan en geeft de JSON-tekst uit het antwoord terug, robuust
 * geparsed. Gooit nooit — elke uitkomst (ontbrekende key, HTTP-fout, kapotte
 * JSON) komt terug als een `LlmResult`, zodat de aanroeper altijd een pad
 * heeft dat niet crasht.
 */
export async function callAnthropic(params: LlmCallParams): Promise<LlmResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "not_configured", message: "ANTHROPIC_API_KEY ontbreekt." };
  }

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        messages: [{ role: "user", content: params.prompt }],
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "http_error",
      message: err instanceof Error ? err.message : "netwerkfout bij Anthropic-aanroep",
    };
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    return {
      ok: false,
      reason: "http_error",
      message: `Anthropic HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`,
    };
  }

  const body = await res.json().catch(() => null);
  const text = extractResponseText(body);
  if (text === null) {
    return { ok: false, reason: "parse_error", message: "Geen tekst in het modelantwoord." };
  }

  const json = firstJsonBlock(text);
  if (json === null) {
    return { ok: false, reason: "parse_error", message: "Geen geldig JSON-blok in modelantwoord." };
  }

  return { ok: true, json };
}

/** Signatuur van callAnthropic, los getrokken zodat aanroepers 'm kunnen
 * injecteren in tests (net als `withTx` in src/lib/sync/engine.ts). */
export type LlmCaller = (params: LlmCallParams) => Promise<LlmResult>;
