import type { Tx } from "@/lib/db/with-user";
import { asLevel, asNotifyPreference, DEFAULT_MANDATE, type Domain, type ResolvedMandate } from "./domains";

/**
 * Het mandaat van één domein voor één gebruiker — de enige plek die de
 * Mandate-tabel leest voor een gate-beslissing. `execute.ts` en
 * `/api/v1/tools` gingen hier eerder allebei los `asPermission(connector.permission)`
 * voor lezen; nu lezen ze allebei dit.
 *
 * Geen rij = niveau 1 (§4 van de opdracht: de voorzichtigste stand), niet een
 * fout — een gebruiker die een bron net gekoppeld heeft, heeft nog geen
 * mandaat ingesteld, en dat hoort niet op "alles mag" uit te komen.
 */
export async function mandateFor(tx: Tx, userId: string, domain: Domain): Promise<ResolvedMandate> {
  const row = await tx.mandate.findUnique({
    where: { user_id_domain: { user_id: userId, domain } },
  });
  if (!row) return DEFAULT_MANDATE;
  return {
    level: asLevel(row.level),
    notifyPreference: asNotifyPreference(parseNotify(row.rules)),
  };
}

function parseNotify(rawRules: string): string | undefined {
  try {
    const parsed = JSON.parse(rawRules) as { notify?: unknown };
    return typeof parsed.notify === "string" ? parsed.notify : undefined;
  } catch {
    return undefined;
  }
}
