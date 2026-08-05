import { NextResponse } from "next/server";
import { decideTool } from "@/lib/actions";
import { toolErrorResponse } from "@/lib/tools/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/tools/calls/[id] — { decision: "approve" | "reject" }.
 *
 * Dezelfde functie als de twee knoppen in instellingen (§ "één gedrag, twee
 * ingangen"). Een ja vanuit een push-melding mag niet iets anders doen dan een
 * ja op het scherm.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => null)) as { decision?: string } | null;
  const decision = body?.decision;

  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json(
      { error: "Veld 'decision' moet 'approve' of 'reject' zijn." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await decideTool(params.id, decision));
  } catch (e) {
    return toolErrorResponse(e);
  }
}
