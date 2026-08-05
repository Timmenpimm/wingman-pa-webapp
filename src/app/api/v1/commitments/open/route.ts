import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/db/client";
import { getOpenCommitments } from "@/lib/commitments";

export const dynamic = "force-dynamic";

// GET /api/v1/commitments/open — gegroepeerd: "ik moet" / "ik wacht op".
export async function GET() {
  const userId = await currentUserId();
  return NextResponse.json(await getOpenCommitments(userId));
}
