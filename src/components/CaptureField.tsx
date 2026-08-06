"use client";

import { useRef } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { captureInbox } from "@/lib/actions";

/**
 * Eén regel om iets kwijt te kunnen zonder na te denken waar het hoort (§6.8).
 * Triëren gebeurt later, in de Inbox — niet hier. Alles wat je hier tegenhoudt
 * ("kies eerst een project") is precies waarom losse eindjes wegzakken.
 *
 * Twee gedaantes, één gedrag: "section" is de inbox-variant met kop en
 * Bewaar-knop; "bare" is de invoer-met-pijlknop uit de referentie (10.png),
 * gebruikt op Vandaag. Beide landen via captureInbox in dezelfde inbox.
 */
export function CaptureField({
  variant = "section",
  placeholder = "Bijvoorbeeld: Ania vragen naar de flyers",
}: {
  variant?: "section" | "bare";
  placeholder?: string;
}) {
  const form = useRef<HTMLFormElement>(null);

  const submit = async (data: FormData) => {
    const text = String(data.get("text") ?? "");
    if (!text.trim()) return;
    await captureInbox(text);
    form.current?.reset();
  };

  if (variant === "bare") {
    return (
      <form ref={form} className="vd-capture" action={submit}>
        <input
          className="input"
          name="text"
          placeholder={placeholder}
          aria-label="Snel iets vastleggen"
          autoComplete="off"
        />
        <button className="vd-capture__go" type="submit" aria-label="Bewaar">
          <ArrowRight weight="bold" />
        </button>
      </form>
    );
  }

  return (
    <section className="section">
      <div className="section__head">
        <h2>Iets kwijt?</h2>
        <span className="section__note">landt in je inbox</span>
      </div>
      <form ref={form} className="field" action={submit}>
        <input
          className="input"
          name="text"
          placeholder={placeholder}
          aria-label="Snel iets vastleggen"
          autoComplete="off"
        />
        <button className="btn btn--quiet" type="submit">
          Bewaar
        </button>
      </form>
    </section>
  );
}
