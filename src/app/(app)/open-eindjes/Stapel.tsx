"use client";

import { useState, useTransition } from "react";
import { resolveCommitment } from "@/lib/actions";
import type { LooseEnd } from "@/lib/commitments";

const SNOOZE_DAYS = 3;

/**
 * De referentie toont open eindjes als drie rustige, afzonderlijke kaarten.
 * Elke actie blijft direct: na de server action verdwijnt uitsluitend de
 * betreffende kaart, zonder dat de rest van de stapel van positie wisselt.
 */
export function Stapel({ items }: { items: LooseEnd[] }) {
  const [resolved, setResolved] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();
  const visible = items.filter((item) => !resolved.has(item.id));

  function act(id: string, status: "done" | "snoozed" | "dismissed") {
    startTransition(() => {
      void resolveCommitment(id, status, status === "snoozed" ? SNOOZE_DAYS : 0);
      setResolved((current) => new Set(current).add(id));
    });
  }

  if (visible.length === 0) {
    return (
      <div className="rest" style={{ marginTop: "var(--s-5)" }}>
        <h2>Alles heeft een plek.</h2>
        <p>Je kunt hier later altijd terugkomen als er iets nieuws boven komt drijven.</p>
      </div>
    );
  }

  return (
    <ul className="action-cards loose-cards" aria-live="polite" aria-busy={pending}>
      {visible.map((item) => {
        const waiting = item.direction === "they_owe";

        return (
          <li key={item.id} className="action-card loose-card">
            <p className="loose-card__title">{item.what}</p>
            {item.context && <p className="row__sub">{item.context}</p>}
            <p className="loose-card__meta">
              {waiting ? `Wacht op ${item.party}` : `${item.party} wacht op jou`} · {item.source_label}
            </p>
            <div className="row__actions">
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => act(item.id, "done")}
                disabled={pending}
              >
                Afhandelen
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => act(item.id, "snoozed")}
                disabled={pending}
              >
                Herinner me
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => act(item.id, "dismissed")}
                disabled={pending}
              >
                Laat vallen
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
