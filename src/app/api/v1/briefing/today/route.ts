import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/db/client";
import { getBriefingToday } from "@/brain/briefing-engine";

export const dynamic = "force-dynamic";

// GET /api/v1/briefing/today — frog, coachregel, top-3, agenda, te bevestigen.
// Eén response per scherm: de PWA haalt dit op bij openen én na een push.
export async function GET() {
  const userId = await currentUserId();
  return NextResponse.json(await getBriefingToday(userId));
}
