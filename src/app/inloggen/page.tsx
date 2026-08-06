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
 *
 * googleConfigured is hetzelfde patroon voor AUTH_GOOGLE_ID/-SECRET (zie
 * auth.ts): zonder die twee staat de Google-provider niet in de providerlijst,
 * dus zou de knop toch nooit iets doen.
 */
export default function InloggenPage({
  searchParams,
}: {
  searchParams: { vanaf?: string; link?: string };
}) {
  const emailConfigured = Boolean(process.env.AUTH_EMAIL_SERVER);
  const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const callbackUrl = safeReturnPath(searchParams.vanaf);
  const linkExpired = searchParams.link === "ongeldig";

  return (
    <div className="login">
      <div className="login__brand"><span>wingman</span><small>welkom</small></div>
      <p className="eyebrow login__eyebrow">Je dag, op jouw ritme</p>
      <h1 className="login__title">Goed dat je er bent.</h1>
      <p className="lede login__lede">
        Wingman helpt je kiezen wat vandaag werkelijk aandacht verdient.
      </p>

      {linkExpired && (
        <p className="login__hint" style={{ marginTop: 0, marginBottom: "var(--s-4)" }} role="alert">
          Die inloglink werkt niet meer — vraag een nieuwe aan of log in met je wachtwoord.
        </p>
      )}

      <LoginForm
        emailConfigured={emailConfigured}
        googleConfigured={googleConfigured}
        callbackUrl={callbackUrl}
      />

      <div className="login__notice">
        <p>
          Wingman leest je agenda en mail alleen om je dag te ordenen. Je kunt elke bron los weer
          intrekken via Instellingen.
        </p>
      </div>
    </div>
  );
}
