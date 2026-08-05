import { NextResponse } from "next/server";
import { resolveCommitment } from "@/lib/actions";

// POST /api/v1/commitment/{id}/done
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await resolveCommitment(params.id, "done");
  return NextResponse.json({ ok: true, id: params.id, status: "done" });
}
