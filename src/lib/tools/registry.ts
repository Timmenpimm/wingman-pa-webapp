import { ADAPTERS } from "@/connectors";
import type { Provider } from "@/lib/types";
import { toolErrors, type ConnectorTool, type ResolvedTool } from "./types";

/**
 * Wat kan Wingman doen — afgeleid uit de adapters, niet apart bijgehouden.
 *
 * Een tweede lijst naast `ADAPTERS` zou binnen een maand uit de pas lopen met
 * de eerste. Dit bestand kent daarom geen enkele toolnaam: het leest ze uit de
 * adapters die er al zijn. Een nieuwe tool toevoegen is één regel in één
 * adapter, en verder niets — geen manifest, geen loader, geen registratie.
 */

function allTools(): ResolvedTool[] {
  return Object.values(ADAPTERS).flatMap((adapter) =>
    (adapter.tools ?? []).map((tool) => ({
      tool: tool as ConnectorTool<unknown>,
      provider: adapter.provider,
      type: adapter.type,
    })),
  );
}

export function toolCatalog(): ResolvedTool[] {
  return allTools().sort((a, b) => a.tool.name.localeCompare(b.tool.name));
}

export function toolsFor(provider: Provider): ResolvedTool[] {
  return allTools().filter((t) => t.provider === provider);
}

export function findTool(name: string): ResolvedTool {
  const found = allTools().find((t) => t.tool.name === name);
  if (!found) throw toolErrors.notFound(name);
  return found;
}

/**
 * Regel 5 uit CLAUDE.md: v1 verstuurt geen mail. Die regel stond tot nu toe
 * alleen in het feit dat niemand een send() had geschreven — een afspraak die
 * de eerste keer sneuvelt dat iemand er wél een schrijft. Nu is het een
 * controle: een mailbron mag concepten maken, niet versturen. Zie ook de test
 * in tests/tools.test.ts, die hier op klapt vóór de code in productie komt.
 */
export function assertNoMailSending(): void {
  const offenders = allTools()
    .filter((t) => t.type === "mail" && t.tool.effect === "write")
    .map((t) => t.tool.name);
  if (offenders.length > 0) {
    throw new Error(
      `v1 verstuurt geen mail (CLAUDE.md, regel 5). Deze tools schrijven wél naar buiten: ${offenders.join(", ")}`,
    );
  }
}
