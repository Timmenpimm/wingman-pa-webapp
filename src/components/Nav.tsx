"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderSimple, GearSix, Sun, Tray } from "@phosphor-icons/react";

/**
 * De Canva-richting gebruikt compacte icooningangen. De zes productroutes
 * blijven allemaal bereikbaar; de toegankelijke naam blijft tekst terwijl het
 * visuele label verdwijnt om de bodemnavigatie rustig te houden op een telefoon.
 */
const ITEMS = [
  { href: "/", label: "Vandaag", icon: Sun },
  { href: "/inbox", label: "Inbox", icon: Tray },
  { href: "/projecten", label: "Projecten en open eindjes", icon: FolderSimple },
  { href: "/instellingen", label: "Instellingen", icon: GearSix },
];

export function Nav() {
  const path = usePathname();
  // Geen navigatie op inloggen én tijdens de onboarding (referentie 2–7:
  // de wizard heeft alleen de voortgangsbalk, geen ontsnappingsroutes onderin).
  if (path === "/inloggen" || path.startsWith("/onboarding")) return null;

  return (
    <nav className="nav" aria-label="Hoofdnavigatie">
      <div className="nav__inner">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} aria-current={
            item.href === "/"
              ? path === "/" ? "page" : undefined
              : item.href === "/projecten"
                ? path.startsWith("/projecten") || path.startsWith("/open-eindjes") ? "page" : undefined
                : path.startsWith(item.href) ? "page" : undefined
          }
            aria-label={item.label}
            title={item.label}
          >
            <item.icon className="nav__icon" weight="regular" aria-hidden="true" />
            <span className="sr-only">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
