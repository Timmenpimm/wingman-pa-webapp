import { NextResponse } from "next/server";
import { prisma, currentUserId } from "@/lib/db/client";
import { captureInbox } from "@/lib/actions";
import { badRequest, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET  /api/v1/inbox — items om te triëren
// POST /api/v1/inbox — vanaf capture-veld, Siri-shortcut of mail-forward
export async function GET() {
  const userId = await currentUserId();
  const items = await prisma.inboxItem.findMany({
    where: { user_id: userId, status: "new" },
    orderBy: { created_at: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await readJson<{ text?: string; source?: string }>(req);
  if (!body) return badRequest("Verwacht een JSON-body.");
  const { text, source } = body;
  if (!text?.trim()) return badRequest("text is verplicht.");
  await captureInbox(text, source ?? "capture");
  return NextResponse.json({ ok: true }, { status: 201 });
}
