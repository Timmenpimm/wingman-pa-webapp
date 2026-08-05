import { NextResponse } from "next/server";
import { currentUserId, withUser } from "@/lib/db/client";
import { updateStyleCard } from "@/lib/actions";
import { badRequest, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET  /api/v1/style-card — "zo schrijf jij", uit verzonden mail
// POST /api/v1/style-card — handmatige correctie; hij zit er soms naast (§6.6)
export async function GET() {
  const userId = await currentUserId();
  const cards = await withUser(userId, (tx) => tx.styleCard.findMany({ where: { user_id: userId } }));
  return NextResponse.json(
    cards.map((c) => ({ ...c, typical: JSON.parse(c.typical) as string[] })),
  );
}

export async function POST(req: Request) {
  const body = await readJson<Record<string, string>>(req);
  if (!body) return badRequest("Verwacht een JSON-body.");
  const { register, greeting, signoff } = body;
  if (!register) return badRequest("register is verplicht.");
  await updateStyleCard(register, { greeting: greeting ?? "", signoff: signoff ?? "" });
  return NextResponse.json({ ok: true });
}
