import type { Metadata, Viewport } from "next";
import { Archivo, Newsreader } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Masthead } from "@/components/Masthead";

/* Newsreader (koppen) en Archivo (interface) uit het ontwerp — zelf
   geladen via next/font, niet via de Google-Fonts-CDN-link uit de bron.
   De families landen op --font-serif / --font-sans; tokens.css leunt
   daarop zonder ze zelf opnieuw te declareren. */
const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-serif",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wingman",
  description: "Persoonlijke assistent die je dag plant en losse eindjes vangt.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Wingman", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#071321",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${newsreader.variable} ${archivo.variable}`}>
      <body>
        <div className="shell">
          <Masthead />
          <main className="page">{children}</main>
          <Nav />
        </div>
      </body>
    </html>
  );
}
