import { NextResponse } from "next/server";

// POST /api/v1/webhooks/ponto-transactions
// Ponto duwt nieuwe transacties; wij zetten alleen een sync-job klaar en doen
// het werk in de worker. Handtekening verifiëren vóór verwerking (PSD2).
export async function POST(req: Request) {
  const signature = req.headers.get("signature");
  if (!process.env.PONTO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "webhook niet geconfigureerd" }, { status: 501 });
  }
  if (!signature) {
    return NextResponse.json({ error: "ontbrekende handtekening" }, { status: 401 });
  }
  // TODO: verifieer handtekening en enqueue sync-connectors voor deze user.
  return NextResponse.json({ ok: true });
}
