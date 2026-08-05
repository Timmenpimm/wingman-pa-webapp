"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Zes ingangen, geen iconen. Iconen zijn geen vervanging van labels (§7) en op
 * een scherm dat vrijwel volledig uit tekst bestaat leiden ze alleen af.
 */
const ITEMS = [
  { href: "/", label: "Vandaag" },
  { href: "/open-eindjes", label: "Open eindjes" },
  { href: "/inbox", label: "Inbox" },
  { href: "/projecten", label: "Projecten" },
  { href: "/week", label: "Week" },
  { href: "/instellingen", label: "Instellingen" },
];

export function Nav() {
  const path = usePathname();
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
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
