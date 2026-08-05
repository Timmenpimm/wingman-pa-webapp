import { withUser } from "@/lib/db/with-user";
import { clamp } from "@/lib/text";

/**
 * Graaf-bevraging (§6.9).
 *
 * In productie hangt hier Graphify onder (per user, EU-gehost, versleuteld) en
 * vertaalt een klein model de natuurlijke vraag naar een graaf-query. Hier
 * draait dezelfde interface op de lokale nodes/edges: zoek op label + type,
 * haal buren op. De vorm van het antwoord is wat telt — kaartjes met
 * verbindingen, geen ruwe JSON (§6.7).
 */

export interface GraphResult {
  query: string;
  interpreted: string;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    summary?: string;
    edges: Array<{ type: string; label: string; to: string }>;
  }>;
}

/** Vragen die de app zelf voorstelt, afgeleid uit wat er in de graaf staat. */
export const SUGGESTED_QUERIES = [
  "wie heb ik de afgelopen maand iets beloofd?",
  "wat zijn mijn open betalingen?",
  "met wie hangt mijn grootste opdracht samen?",
  "welke transacties hangen bij Zomerlab?",
];

const SYNONYMS: Array<{ match: RegExp; types: string[]; hint: string }> = [
  {
    match: /belo(ofd|fte)|toegezegd|moet ik/i,
    types: ["Commitment"],
    hint: "open beloftes van jou",
  },
  {
    match: /betaling|transactie|geld|factuur|schuld/i,
    types: ["Transaction", "Account"],
    hint: "geldstromen en open betalingen",
  },
  { match: /project/i, types: ["Project"], hint: "projecten en wat eraan hangt" },
  { match: /wie|persoon|contact/i, types: ["Person"], hint: "mensen in je netwerk" },
];

export async function queryGraph(userId: string, rawQuery: string): Promise<GraphResult> {
  // Alles binnen één transactie: RLS leest app.user_id uit de sessie en die
  // wordt per transactie gezet (zie with-user.ts).
  return withUser(userId, async (tx) => {
    const q = rawQuery.trim();
    const rule = SYNONYMS.find((s) => s.match.test(q));
    const terms = q
      .toLowerCase()
      .split(/[^a-z0-9À-ÿ]+/)
      .filter((t) => t.length > 3);

    // Een vraag als "welke transacties hangen bij Zomerlab?" bevat twee dingen:
    // een type (transacties) en een anker (Zomerlab). Alleen op type filteren
    // geeft álle transacties terug — het juiste antwoord op de verkeerde vraag.
    // Daarom eerst het anker zoeken, dan langs de verbindingen lopen.
    const anchors = terms.length
      ? await tx.graphNode.findMany({
          where: { user_id: userId, OR: terms.map((t) => ({ label: { contains: t } })) },
          take: 8,
        })
      : [];

    let finalNodes = anchors;

    if (rule) {
      const ofType = anchors.filter((n) => rule.types.includes(n.type));

      if (anchors.length > 0 && ofType.length === 0) {
        // Anker gevonden, maar van het verkeerde type: pak de buren die wél
        // het gevraagde type hebben.
        const anchorIds = anchors.map((a) => a.id);
        const links = await tx.graphEdge.findMany({
          where: {
            user_id: userId,
            OR: [{ from_id: { in: anchorIds } }, { to_id: { in: anchorIds } }],
          },
        });
        const neighbourIds = Array.from(
          new Set(links.flatMap((l) => [l.from_id, l.to_id])),
        ).filter((id) => !anchorIds.includes(id));

        finalNodes = await tx.graphNode.findMany({
          where: { user_id: userId, id: { in: neighbourIds }, type: { in: rule.types } },
          take: 12,
        });
      } else if (ofType.length > 0) {
        finalNodes = ofType;
      } else {
        // Geen anker, wel een herkend type: toon dan dat type.
        finalNodes = await tx.graphNode.findMany({
          where: { user_id: userId, type: { in: rule.types } },
          take: 12,
        });
      }
    }

    const ids = finalNodes.map((n) => n.id);
    const edges = ids.length
      ? await tx.graphEdge.findMany({
          where: { user_id: userId, from_id: { in: ids } },
        })
      : [];

    const labelById = new Map(
      (
        await tx.graphNode.findMany({
          where: { user_id: userId, id: { in: edges.map((e) => e.to_id) } },
          select: { id: true, label: true },
        })
      ).map((n) => [n.id, n.label]),
    );

    return {
      query: q,
      interpreted: rule ? rule.hint : "vrije zoekopdracht op labels",
      nodes: finalNodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: clamp(n.label, "graphNodeTitle"),
        summary: n.summary ?? undefined,
        edges: edges
          .filter((e) => e.from_id === n.id)
          .map((e) => ({
            type: clamp(e.type, "graphEdgeLabel"),
            label: e.label ?? "",
            to: labelById.get(e.to_id) ?? e.to_id,
          })),
      })),
    };
  });
}
