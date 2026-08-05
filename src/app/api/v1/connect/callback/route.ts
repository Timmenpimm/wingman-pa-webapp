import { NextResponse } from "next/server";
import { currentUserId, withUser } from "@/lib/db/client";

/**
 * POST /api/v1/connect/callback — Nango meldt dat een koppeling rond is.
 *
 * We slaan hier geen tokens op: die blijven bij Nango en worden per sync
 * opgehaald. Wat we wél bijwerken is de status, want die bepaalt of de briefing
 * zichzelf incompleet moet noemen.
 */
export async function POST(req: Request) {
  if (!process.env.NANGO_SECRET_KEY) {
    return NextResponse.json(
      { error: "Geen OAuth geconfigureerd", detail: "Zet NANGO_SECRET_KEY in .env." },
      { status: 501 },
    );
  }
  if (req.headers.get("x-nango-signature") !== process.env.NANGO_SECRET_KEY) {
    return NextResponse.json({ error: "ongeldige handtekening" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    provider?: string;
    connectionId?: string;
  };
  if (!body.provider || !body.connectionId) {
    return NextResponse.json({ error: "provider en connectionId verplicht" }, { status: 400 });
  }

  const userId = await currentUserId();
  await withUser(userId, (tx) =>
    tx.connector.updateMany({
      where: { user_id: userId, provider: body.provider },
      data: { status: "active", error_message: null, last_sync_at: null },
    }),
  );

  return NextResponse.json({ ok: true });
}
