"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const EMPTY_FIELDS_ERROR = "Vul je e-mail en wachtwoord in — dan zet ik je dag klaar.";
const INVALID_CREDENTIALS_ERROR = "Dat e-mailadres en wachtwoord ken ik niet samen.";
const GENERIC_LOGIN_ERROR = "Inloggen lukte niet — probeer het nog eens.";
const EMAIL_NOT_CONFIGURED_HINT = "Mailen is nog niet ingesteld — log in met je wachtwoord.";
const MISSING_EMAIL_HINT = "Vul eerst je e-mailadres in.";
const LINK_SEND_FAILED_HINT = "Verzenden lukte niet — probeer het later opnieuw.";

/**
 * Client component voor het inlogscherm (§ opgave): toon/verberg-schakelaar
 * en laadstaat vragen om interactie, de rest van de app blijft server-first.
 *
 * "Stuur me een inloglink" is eerlijk over of mailen aanstaat: emailConfigured
 * komt van de server (AUTH_EMAIL_SERVER wel/niet gezet) — zonder mailserver
 * doet de knop geen alsof-verzoek, hij legt meteen uit dat het nog niet kan.
 */
export function LoginForm({
  emailConfigured,
  callbackUrl,
}: {
  emailConfigured: boolean;
  callbackUrl: string;
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [linkSent, setLinkSent] = useState(false);
  const [linkSending, setLinkSending] = useState(false);
  const [linkHint, setLinkHint] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setFormError(EMPTY_FIELDS_ERROR);
      return;
    }

    setFormError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl,
      });
      if (!result || result.error) {
        setFormError(INVALID_CREDENTIALS_ERROR);
        return;
      }
      router.push(result.url || callbackUrl);
      router.refresh();
    } catch {
      setFormError(GENERIC_LOGIN_ERROR);
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!emailConfigured) {
      setLinkHint(EMAIL_NOT_CONFIGURED_HINT);
      return;
    }
    if (!email.trim()) {
      setLinkHint(MISSING_EMAIL_HINT);
      return;
    }

    setLinkHint(null);
    setLinkSending(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setLinkSent(true);
      } else {
        setLinkHint(LINK_SEND_FAILED_HINT);
      }
    } catch {
      setLinkHint(LINK_SEND_FAILED_HINT);
    } finally {
      setLinkSending(false);
    }
  }

  return (
    <>
      <form className="login__form" onSubmit={handleSubmit} noValidate>
        <label className="login__label">
          <span className="eyebrow">E-mail</span>
          <input
            className="input"
            type="email"
            name="email"
            autoComplete="username"
            placeholder="nora@studio.nl"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFormError(null);
            }}
          />
        </label>

        <label className="login__label">
          <span className="login__label-row">
            <span className="eyebrow">Wachtwoord</span>
            <button
              type="button"
              className="login__toggle"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
            >
              {showPassword ? "Verberg" : "Toon"}
            </button>
          </span>
          <input
            className="input"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFormError(null);
            }}
          />
        </label>

        {formError && (
          <p className="login__error" role="alert">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 8v5" />
              <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <span>{formError}</span>
          </p>
        )}

        <button className="btn btn--primary login__submit" type="submit" disabled={loading}>
          {loading ? "Even je dag ophalen…" : "Inloggen"}
        </button>
      </form>

      <div className="login__divider" role="presentation">
        of
      </div>

      <button
        type="button"
        className="btn btn--quiet login__submit"
        onClick={handleMagicLink}
        disabled={linkSent || linkSending}
      >
        {linkSent ? "Link verstuurd — check je mail" : "Stuur me een inloglink"}
      </button>
      {linkHint && <p className="login__hint">{linkHint}</p>}
    </>
  );
}
