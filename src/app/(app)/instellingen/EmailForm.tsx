"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateEmail } from "@/lib/actions";

/**
 * Het adresveld met terugkoppeling.
 *
 * Zonder dit stukje client-component slikt het formulier zijn eigen fout in:
 * de server action weigert bijvoorbeeld een adres dat al bezet is, maar het
 * scherm blijft er hetzelfde uitzien. Dan denk je dat het gelukt is, en kom je
 * er pas achter als de briefing van 08:00 niet aankomt.
 */

type Stand = { fout?: string; gelukt?: boolean };

export function EmailForm({ huidig }: { huidig: string }) {
  const [stand, actie] = useFormState(
    async (_vorige: Stand, data: FormData): Promise<Stand> => {
      const uitkomst = await updateEmail(data);
      return uitkomst.fout ? { fout: uitkomst.fout } : { gelukt: true };
    },
    {},
  );

  return (
    <form action={actie}>
      <div className="field">
        <label className="sr-only" htmlFor="email">
          E-mailadres waarop je de briefing ontvangt
        </label>
        <input
          id="email"
          className="input"
          type="email"
          name="email"
          defaultValue={huidig}
          required
          autoComplete="email"
          aria-describedby="email-uitleg"
        />
        <Knop />
      </div>

      <p id="email-uitleg" className="meta" style={{ marginTop: "var(--s-2)" }}>
        {stand.fout ? (
          <span style={{ color: "var(--signal)" }}>{stand.fout}</span>
        ) : stand.gelukt ? (
          "Opgeslagen. Vanaf nu log je hiermee in."
        ) : (
          "Hier komt je briefing binnen, en hiermee log je in."
        )}
      </p>
    </form>
  );
}

function Knop() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn--quiet" type="submit" disabled={pending}>
      {pending ? "Opslaan…" : "Opslaan"}
    </button>
  );
}
