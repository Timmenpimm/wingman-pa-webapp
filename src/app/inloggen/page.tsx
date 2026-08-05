import { safeReturnPath } from "@/lib/return-path";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

/**
 * /inloggen — enige publieke pagina (zie src/middleware.ts). Server component
 * op alles behalve de toon/verberg-schakelaar en de laadstaat, die in
 * LoginForm.tsx zitten (§ opgave: "mag een client component zijn voor…").
 *
 * emailConfigured leest AUTH_EMAIL_SERVER hier op de server — de client komt
 * nooit in de buurt van of hóe mail verstuurd wordt, alleen van het feit of
 * het kan.
 */
export default function InloggenPage({
  searchParams,
}: {
  searchParams: { vanaf?: string; link?: string };
}) {
  const emailConfigured = Boolean(process.env.AUTH_EMAIL_SERVER);
  const callbackUrl = safeReturnPath(searchParams.vanaf);
  const linkExpired = searchParams.link === "ongeldig";

  return (
    <div className="login">
      <span className="login__mark" aria-hidden="true">
        <svg
          width="23"
          height="23"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      </span>

      <h1 className="login__title">Wingman</h1>
      <p className="lede login__lede">
        Je hoeft niet alles zelf te onthouden. Log in en ik zet de dag voor je klaar.
      </p>

      {linkExpired && (
        <p className="login__hint" style={{ marginTop: 0, marginBottom: "var(--s-4)" }} role="alert">
          Die inloglink werkt niet meer — vraag een nieuwe aan of log in met je wachtwoord.
        </p>
      )}

      <LoginForm emailConfigured={emailConfigured} callbackUrl={callbackUrl} />

      <div className="login__notice">
        <p>
          Wingman leest je agenda en mail alleen om je dag te ordenen. Je kunt elke bron los weer
          intrekken via Instellingen.
        </p>
      </div>
    </div>
  );
}

