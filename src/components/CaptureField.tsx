"use client";

import { useRef } from "react";
import { captureInbox } from "@/lib/actions";

/**
 * Eén regel om iets kwijt te kunnen zonder na te denken waar het hoort (§6.8).
 * Triëren gebeurt later, in de Inbox — niet hier. Alles wat je hier tegenhoudt
 * ("kies eerst een project") is precies waarom losse eindjes wegzakken.
 */
export function CaptureField() {
  const form = useRef<HTMLFormElement>(null);

  return (
    <section className="section">
      <div className="section__head">
        <h2>Iets kwijt?</h2>
        <span className="section__note">landt in je inbox</span>
      </div>
      <form
        ref={form}
        className="field"
        action={async (data: FormData) => {
          const text = String(data.get("text") ?? "");
          if (!text.trim()) return;
          await captureInbox(text);
          form.current?.reset();
        }}
      >
        <input
          className="input"
          name="text"
          placeholder="Bijvoorbeeld: Ania vragen naar de flyers"
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
