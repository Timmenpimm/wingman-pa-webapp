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
          Wingman<span>werktitel</span>
        </Link>
        <Link href="/graaf" className="masthead__search">
          Vraag je graaf
        </Link>
      </div>
    </header>
  );
}
