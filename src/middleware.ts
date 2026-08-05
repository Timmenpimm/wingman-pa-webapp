import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Toegangsslot voor niet-publieke omgevingen.
 *
 * Waarom dit bestaat: Vercel Authentication dekt op het huidige plan alleen
 * deployment-URL's, niet het productiedomein. Zonder dit slot stond
 * wingman-pa-webapp.vercel.app open — inclusief /api/v1/briefing/today, dat
 * agendagegevens teruggeeft. Voor een app die mail, agenda en bank leest is
 * "het is maar demodata" geen verdediging: de vorm van het lek is het
 * probleem, niet de inhoud.
 *
 * Dit is een deurslot, geen gebruikersauthenticatie. Echte accounts (NextAuth
 * + row-level security per gebruiker) komen als de app meerdere mensen krijgt;
 * tot die tijd houdt dit iedereen buiten die het wachtwoord niet heeft.
 *
 * Zonder ACCESS_PASSWORD doet dit niets — lokaal ontwikkelen blijft dus vrij.
 */
export function middleware(req: NextRequest) {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization");

  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    const given = separator === -1 ? "" : decoded.slice(separator + 1);
    const expected = password;

    // Vergelijking in constante tijd: een naïeve === lekt via responstijd hoe
    // veel van het wachtwoord klopt.
    if (given.length === expected.length) {
      let diff = 0;
      for (let i = 0; i < expected.length; i++) {
        diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
      }
      if (diff === 0) return NextResponse.next();
    }
  }

  return new NextResponse("Toegang alleen met wachtwoord.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Wingman", charset="UTF-8"',
      "cache-control": "no-store",
    },
  });
}

export const config = {
  // Alles achter het slot, ook de API. Alleen de statische build-assets en het
  // PWA-icoon blijven vrij, anders laadt het inlogscherm zichzelf niet.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
