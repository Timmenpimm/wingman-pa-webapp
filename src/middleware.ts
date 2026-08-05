import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "../auth.config";

/**
 * Toegangsslot — nu sessiecontrole in plaats van één gedeeld wachtwoord.
 *
 * Dit is de enige toegangspoort tot productie (zie het `matcher` hieronder:
 * alles behalve statische build-assets en het PWA-icoon loopt hierdoorheen).
 * Een gat hier betekent dat de hele app open staat, inclusief /api/v1/* dat
 * agenda-, mail- en bankgegevens teruggeeft — dus strikt, niet slim:
 *
 *   - geen sessie + pagina  → redirect naar /inloggen
 *   - geen sessie + /api/v1 → 401 JSON (geen redirect: een fetch-call kan
 *     een redirect niet volgen naar een inlogscherm en zou anders op een
 *     onduidelijke manier stuklopen)
 *   - /inloggen, /api/auth/* en de statische assets blijven vrij — zonder
 *     die vrijstelling kan het inlogscherm zichzelf niet laden en kan
 *     NextAuth zijn eigen routes (sign-in, callback, sessie-check) niet
 *     bereiken.
 *
 * Anders dan het oude wachtwoordslot is er geen "geen env-var = open" vrijstelling
 * meer: ook lokaal moet je inloggen. Dat is met opzet — de vorige vrijstelling
 * bestond voor een gedeeld wachtwoord dat je lokaal niet wilde intypen; met
 * echte sessies is inloggen net zo goedkoop als eenmalig het seed-wachtwoord
 * gebruiken (zie prisma/seed.ts).
 *
 * Dit bestand importeert bewust alleen auth.config.ts, nooit ../auth.ts.
 * auth.ts trekt Prisma en bcryptjs binnen (via de Credentials-provider) en
 * geen van beide werkt in de Edge-runtime waarin middleware draait. Zie de
 * toelichting in auth.config.ts.
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/inloggen", "/api/auth"];

/**
 * Niet openbaar, maar wél zonder sessie: dit endpoint draait werk uit voor
 * álle gebruikers en hoort dus bij geen enkele sessie. Het bewijst zichzelf
 * met een gedeeld geheim (RUNS_SECRET) in de route zelf. Zonder dat geheim
 * geconfigureerd geeft de route 501 en gebeurt er niets.
 */
const EIGEN_AUTHENTICATIE = ["/api/v1/runs/tick"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  if (EIGEN_AUTHENTICATIE.includes(pathname)) {
    return NextResponse.next();
  }

  if (req.auth) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/v1")) {
    return NextResponse.json(
      { error: "unauthorized", message: "Log in om bij deze gegevens te kunnen." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const loginUrl = new URL("/inloggen", req.nextUrl.origin);
  loginUrl.searchParams.set("vanaf", pathname);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  // Alles achter het slot, ook de API. Alleen de statische build-assets en het
  // PWA-icoon blijven vrij, anders laadt het inlogscherm zichzelf niet.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
