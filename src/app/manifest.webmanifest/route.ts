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
    background_color: "#071321",
    theme_color: "#071321",
    lang: "nl",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  });
}
