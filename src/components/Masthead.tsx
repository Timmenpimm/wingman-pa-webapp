"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * De loupe is de ingang naar de graaf vanaf elk scherm (§6.9).
 *
 * Op het inlogscherm hoort deze balk niet: elke link erin wijst naar een
 * pagina waar je zonder sessie toch niet komt, dus je zou alleen maar tegen
 * een redirect terug naar inloggen aanlopen.
 */
export function Masthead() {
  const path = usePathname();
  if (path === "/inloggen") return null;

  return (
    <header className="masthead">
      <div className="masthead__inner">
        <Link href="/" className="wordmark">
          wingman
        </Link>
        <Link href="/graaf" className="masthead__search" aria-label="Vraag je graaf">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="5.5" />
            <path d="m16 16 4 4" />
          </svg>
          <span className="sr-only">Vraag je graaf</span>
        </Link>
      </div>
    </header>
  );
}
