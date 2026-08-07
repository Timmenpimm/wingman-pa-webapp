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
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  });
}
