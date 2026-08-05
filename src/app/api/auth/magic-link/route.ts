import { NextRequest, NextResponse } from "next/server";
import { ownerPrisma as prisma } from "@/lib/db/owner-prisma";
import { signMagicLinkToken } from "@/lib/auth/magic-link";
import { sendMagicLinkMail } from "@/lib/auth/mailer";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/magic-link — "Stuur me een inloglink" op /inloggen.
 *
 * Verstuurt alleen echt iets als AUTH_EMAIL_SERVER is gezet. Staat die leeg,
 * dan is dit een 501 en laat het inlogscherm dat eerlijk zien — geen knop die
 * doet alsof er iets onderweg is terwijl er nooit mail verstuurd wordt.
 *
 * Ook dit is een pre-sessie lookup (net als in auth.ts): er is nog geen
 * userId om app.user_id mee te zetten, dus gaat de user-by-email-query via
 * de eigenaarsrol. Zie src/lib/db/owner-prisma.ts.
 */
export async function POST(req: NextRequest) {
  if (!process.env.AUTH_EMAIL_SERVER) {
    return NextResponse.json(
      { error: "not_configured", message: "Mailen is nog niet ingesteld." },
      { status: 501 },
    );
  }

  let email = "";
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    // Geen of onleesbare body — hieronder afgevangen door de lege-check.
  }

  if (!email) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Onbekend adres krijgt hetzelfde antwoord als een bekend adres: deze route
  // is geen manier om af te tasten welke e-mailadressen een account hebben.
  // Er wordt dan alleen geen mail verstuurd.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await signMagicLinkToken(user.email);
    const url = new URL("/api/auth/magic-link/callback", req.nextUrl.origin);
    url.searchParams.set("token", token);
    await sendMagicLinkMail(user.email, url.toString());
  }

  return NextResponse.json({ ok: true });
}
