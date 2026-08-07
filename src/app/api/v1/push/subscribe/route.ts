import { NextResponse } from "next/server";
import { currentUserId, withUser } from "@/lib/db/client";
import { badRequest, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

interface SubscriptionBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/**
 * POST /api/v1/push/subscribe — slaat een browser-pushabonnement op.
 *
 * Achter sessie, RLS-patroon (withUser), zelfde opzet als de andere
 * schrijf-routes (zie style-card/route.ts). `endpoint` is uniek over alle
 * gebruikers heen (de browser genereert 'm), dus dit is een upsert: een
 * herregistratie vanaf hetzelfde toestel (nieuwe toestemming, herinstallatie
 * van de PWA) overschrijft de bestaande rij in plaats van een dubbele aan te
 * maken.
 */
export async function POST(req: Request) {
  const body = await readJson<SubscriptionBody>(req);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return badRequest("Verwacht endpoint en keys.p256dh/keys.auth.");
  }

  const userId = await currentUserId();

  try {
    await withUser(userId, (tx) =>
      tx.pushSubscription.upsert({
        where: { endpoint },
        create: { user_id: userId, endpoint, p256dh, auth },
        update: { p256dh, auth },
      }),
    );
  } catch {
    // Bijna altijd een botsing op `endpoint` die RLS niet liet zien (rij
    // hoort bij een andere gebruiker, bv. hetzelfde toestel met een ander
    // account). Zeldzaam, maar een 500 zonder uitleg is erger dan dit.
    return badRequest("Dit abonnement kon niet opgeslagen worden.");
  }

  return NextResponse.json({ ok: true });
}
