"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * De Canva-richting gebruikt compacte icooningangen. De zes productroutes
 * blijven allemaal bereikbaar; de toegankelijke naam blijft tekst terwijl het
 * visuele label verdwijnt om de bodemnavigatie rustig te houden op een telefoon.
 */
const ITEMS = [
  { href: "/", label: "Vandaag", icon: "sun" },
  { href: "/open-eindjes", label: "Open eindjes", icon: "threads" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/projecten", label: "Projecten", icon: "folder" },
  { href: "/week", label: "Week", icon: "week" },
  { href: "/instellingen", label: "Instellingen", icon: "settings" },
];

function Icon({ name }: { name: (typeof ITEMS)[number]["icon"] }) {
  if (name === "sun") return <><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></>;
  if (name === "threads") return <><path d="M5 5.5h14v10H9l-4 3v-13Z" /><path d="M8 9h8M8 12h5" /></>;
  if (name === "inbox") return <><path d="M4 7.5h16l1.2 9.5H2.8L4 7.5Z" /><path d="M3 14h5l1.2 2h5.6l1.2-2h5" /></>;
  if (name === "folder") return <path d="M3 6.5h6l1.8 2H21v9.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.3V6.5Z" />;
  if (name === "week") return <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h.01M12 14h.01M16 14h.01" /></>;
  return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5.3v-3h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.5 1Z" /></>;
}

export function Nav() {
  const path = usePathname();
  // Geen navigatie op het inlogscherm — zie Masthead.tsx.
  if (path === "/inloggen") return null;

  return (
    <nav className="nav" aria-label="Hoofdnavigatie">
      <div className="nav__inner">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={
              item.href === "/" ? (path === "/" ? "page" : undefined) : path.startsWith(item.href) ? "page" : undefined
            }
            aria-label={item.label}
            title={item.label}
          >
            <svg className="nav__icon" viewBox="0 0 24 24" aria-hidden="true"><Icon name={item.icon} /></svg>
            <span className="sr-only">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
