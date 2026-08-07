import { NextResponse } from "next/server";

// PWA-manifest. Installatie is een voorwaarde voor web push op iOS (16.4+),
// dus dit is geen bijzaak: zonder installatie valt de briefing terug op mail.
export function GET() {
  return NextResponse.json({
    name: "Wingman",
    short_name: "Wingman",
    description: "Plant je dag en vangt losse eindjes.",
    start_url: "/",
    display: "standalone",
    // Gelijk aan --paper in tokens.css. Loopt dit uiteen, dan start de
    // geïnstalleerde app met een splash in de ene kleur en klapt hij bij de
    // eerste render naar de andere; Android toont dezelfde waarde bovendien
    // in de task-switcher.
    background_color: "#f4f5f7",
    theme_color: "#f4f5f7",
    lang: "nl",
    // SVG alleen laten voor "any" negeert iOS: die snapt geen SVG voor het
    // home-scherm en valt terug op een schermafdruk-bookmark. PNG's op vaste
    // afmetingen dekken favicon (192) en manifest (192/512); de maskable
    // variant is een los bestand met een kleiner, ruimer gecentreerd
    // merkteken — dezelfde afbeelding op "any" en "maskable" zetten zou de
    // W onder Android's cirkel-uitsnede laten wegvallen.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}
