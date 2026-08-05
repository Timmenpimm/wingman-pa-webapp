import { NextResponse } from "next/server";
import { currentUserId, withUser } from "@/lib/db/client";
import { badRequest, readJson } from "@/lib/api";

// POST /api/v1/graph/cluster  { cluster_id: "schulden" } → subgraaf
// GET  /api/v1/graph/cluster                            → beschikbare clusters
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  const nodes = await withUser(userId, (tx) =>
    tx.graphNode.findMany({
      where: { user_id: userId },
      select: { cluster: true },
    }),
  );
  const counts = new Map<string, number>();
  for (const n of nodes) {
    if (n.cluster) counts.set(n.cluster, (counts.get(n.cluster) ?? 0) + 1);
  }
  return NextResponse.json(
    Array.from(counts, ([id, size]) => ({ id, size })).sort((a, b) => b.size - a.size),
  );
}

export async function POST(req: Request) {
  const body = await readJson<{ cluster_id?: string }>(req);
  if (!body) return badRequest("Verwacht een JSON-body.");
  if (!body.cluster_id) return badRequest("cluster_id is verplicht.");

  const userId = await currentUserId();
  const { nodes, edges } = await withUser(userId, async (tx) => {
    const nodes = await tx.graphNode.findMany({
      where: { user_id: userId, cluster: body.cluster_id },
    });
    const ids = nodes.map((n) => n.id);
    const edges = await tx.graphEdge.findMany({
      where: {
        user_id: userId,
        AND: [{ from_id: { in: ids } }, { to_id: { in: ids } }],
      },
    });
    return { nodes, edges };
  });

  return NextResponse.json({ cluster_id: body.cluster_id, nodes, edges });
}
