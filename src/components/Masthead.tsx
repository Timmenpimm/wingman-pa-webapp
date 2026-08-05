import Link from "next/link";

/** De loupe is de ingang naar de graaf vanaf elk scherm (§6.9). */
export function Masthead() {
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
