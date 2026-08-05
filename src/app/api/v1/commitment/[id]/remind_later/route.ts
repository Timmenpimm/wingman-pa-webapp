import { NextResponse } from "next/server";
import { resolveCommitment } from "@/lib/actions";

// POST /api/v1/commitment/{id}/remind_later  { days: 3 }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => ({}))) as { days?: number };
  const days = Number.isFinite(body.days) ? Number(body.days) : 3;
  await resolveCommitment(params.id, "snoozed", days);
  return NextResponse.json({ ok: true, id: params.id, status: "snoozed", days });
}
