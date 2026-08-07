import { NextRequest, NextResponse } from "next/server";
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
 * Dit is meteen het registratiepad voor de inloglink: de link gaat naar elk
 * adres, bestaand of niet — er wordt hier geen User opgezocht of aangemaakt.
 * Bestaat het adres nog niet, dan ontstaat de User pas bij het verzilveren
 * van de link (zie magicLinkProvider in ../../../../../auth.ts), met een
 * geldig token als bewijs dat het adres van de aanvrager is. Twee dingen
 * volgen daaruit vanzelf: dit endpoint blijft geen manier om af te tasten
 * welke e-mailadressen al een account hebben (het antwoord is voor een
 * bestaand en een nieuw adres identiek), en het is geen aparte
 * registratie-actie die los kan raken van het echt inloggen.
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

  const token = await signMagicLinkToken(email);
  const url = new URL("/api/auth/magic-link/callback", req.nextUrl.origin);
  url.searchParams.set("token", token);
  await sendMagicLinkMail(email, url.toString());

  return NextResponse.json({ ok: true });
}
