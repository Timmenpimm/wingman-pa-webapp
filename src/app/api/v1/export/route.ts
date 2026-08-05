import { NextResponse } from "next/server";
import { prisma, currentUserId } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/export — alles wat we van je hebben, als één JSON-bestand.
 *
 * Geen bijzaak maar een eis: bij bijzondere categorieën (schulden, gezondheid,
 * uitkering) moet inzage en meename zichtbaar in de UI zitten, niet via een
 * supportverzoek. Tokens gaan er nooit in mee.
 */
export async function GET() {
  const userId = await currentUserId();

  const [user, connectors, events, emails, transactions, commitments, people, projects, briefings, inbox, styleCards, nodes, edges] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.connector.findMany({ where: { user_id: userId } }),
      prisma.event.findMany({ where: { user_id: userId } }),
      prisma.email.findMany({ where: { user_id: userId } }),
      prisma.transaction.findMany({ where: { user_id: userId } }),
      prisma.commitment.findMany({ where: { user_id: userId } }),
      prisma.person.findMany({ where: { user_id: userId } }),
      prisma.project.findMany({ where: { user_id: userId } }),
      prisma.dailyBriefing.findMany({ where: { user_id: userId } }),
      prisma.inboxItem.findMany({ where: { user_id: userId } }),
      prisma.styleCard.findMany({ where: { user_id: userId } }),
      prisma.graphNode.findMany({ where: { user_id: userId } }),
      prisma.graphEdge.findMany({ where: { user_id: userId } }),
    ]);

  const payload = {
    exported_at: new Date().toISOString(),
    user,
    // Tokens eruit: een export is voor de gebruiker, niet voor een aanvaller
    // die het bestand later te pakken krijgt.
    connectors: connectors.map(({ access_token, refresh_token, ...rest }) => rest),
    events,
    emails,
    transactions,
    commitments,
    people,
    projects,
    briefings,
    inbox,
    style_cards: styleCards,
    graph: { nodes, edges },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="wingman-export.json"',
    },
  });
}
