"use client";

import { useState } from "react";
import type { LooseEnd } from "@/lib/commitments";
import { Stapel } from "./Stapel";

/**
 * Referentiebeeld toont chips "Alle · Mails · Agenda · Financiën" boven de
 * stapel. "Financiën" bestaat niet als apart brontype in het commitment-model
 * (alleen email/calendar/chat/inference/manual/voice) — geen nepcategorie
 * tonen die nooit vult. De chips volgen dus de échte bronnen die voorkomen.
 */
const LABELS: Record<string, string> = {
  email: "Mail",
  calendar: "Agenda",
  chat: "Chat",
  inference: "Afgeleid",
  manual: "Notitie",
  voice: "Notitie",
};

export function FilterableStapel({ items }: { items: LooseEnd[] }) {
  const kinds = Array.from(new Set(items.map((item) => item.source))).filter(
    (kind) => LABELS[kind],
  );
  const [active, setActive] = useState<string | null>(null);
  const visible = active ? items.filter((item) => item.source === active) : items;

  if (kinds.length < 2) return <Stapel items={items} />;

  return (
    <>
      <div className="oe-filters" role="group" aria-label="Filter op bron">
        <button
          type="button"
          className={`oe-filter${active === null ? " is-active" : ""}`}
          onClick={() => setActive(null)}
        >
          Alle
        </button>
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`oe-filter${active === kind ? " is-active" : ""}`}
            onClick={() => setActive(kind)}
          >
            {LABELS[kind]}
          </button>
        ))}
      </div>
      <Stapel items={visible} />
    </>
  );
}
