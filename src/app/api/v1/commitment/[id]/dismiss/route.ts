import { NextResponse } from "next/server";
import { resolveCommitment } from "@/lib/actions";

// POST /api/v1/commitment/{id}/dismiss — laat vallen. Geen bevestigingsdialoog:
// even makkelijk als afvinken, anders blijft de lijst staan (§6.2).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await resolveCommitment(params.id, "dismissed");
  return NextResponse.json({ ok: true, id: params.id, status: "dismissed" });
}
