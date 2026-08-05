import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Masthead } from "@/components/Masthead";

export const metadata: Metadata = {
  title: "Wingman",
  description: "Persoonlijke assistent die je dag plant en losse eindjes vangt.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Wingman", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#14130f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
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
