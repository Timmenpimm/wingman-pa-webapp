import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/db/client";
import { pendingToolCalls, recentToolCalls } from "@/lib/tools/execute";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/tools/calls — de wachtrij en het logboek.
 *
 * Beide uit dezelfde tabel, want het is dezelfde vraag op twee momenten: wat
 * wil Wingman doen, en wat heeft hij gedaan. Parameters gaan hier niet
 * overheen; de samenvatting wel. Tokens sowieso niet.
 */
export async function GET() {
  const userId = await currentUserId();
  const [pending, recent] = await Promise.all([
    pendingToolCalls(userId),
    recentToolCalls(userId),
  ]);
  return NextResponse.json({ pending, recent });
}
