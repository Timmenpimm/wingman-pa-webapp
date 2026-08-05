import { NextResponse } from "next/server";

/**
 * POST /api/v1/webhooks/google-calendar
 *
 * Google stuurt een leeg duwtje ("er is iets veranderd"), geen inhoud. We doen
 * hier dus niets zwaars: kanaal valideren en een sync inplannen. Het echte werk
 * hoort in de worker, anders loopt een request-handler vol op een dag met veel
 * agendawijzigingen.
 */
export async function POST(req: Request) {
  const channelId = req.headers.get("x-goog-channel-id");
  const token = req.headers.get("x-goog-channel-token");

  if (!process.env.GOOGLE_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "webhook niet geconfigureerd" }, { status: 501 });
  }
  if (!channelId || token !== process.env.GOOGLE_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "onbekend kanaal" }, { status: 401 });
  }

  // TODO: enqueue sync-connectors voor de user die bij dit kanaal hoort.
  return new NextResponse(null, { status: 204 });
}
