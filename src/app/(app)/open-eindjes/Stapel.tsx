"use client";

import { useState, useTransition } from "react";
import { resolveCommitment } from "@/lib/actions";
import type { LooseEnd } from "@/lib/commitments";
import { durationPhrase } from "@/lib/text";

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
    <ul className="oe-list" aria-live="polite" aria-busy={pending}>
      {visible.map((item) => {
        const waiting = item.direction === "they_owe";

        return (
          <li key={item.id} className="oe-card">
            <p className="oe-card__title">{item.what}</p>
            {/* Referentie 12.png: één regel context onder de titel. De
                richting ("wacht op…") blijft de fallback als er geen
                context is — dat onderscheid is het product, de regel de vorm. */}
            {item.context && <p className="oe-card__sub">{item.context}</p>}
            {/* Wie, hoe lang open en bron horen altijd zichtbaar te zijn (§6.2) —
                context is aanvulling, geen vervanging. */}
            <p className="oe-card__meta">
              {waiting ? `Wacht op ${item.party}` : `${item.party} wacht op jou`} ·{" "}
              {durationPhrase(item.opened_at)} open · {item.source_label}
            </p>
            <div className="oe-card__actions">
              <button
                type="button"
                className="btn btn--chip"
                onClick={() => act(item.id, "done")}
                disabled={pending}
              >
                Afhandelen
              </button>
              <button
                type="button"
                className="btn btn--chip"
                onClick={() => act(item.id, "snoozed")}
                disabled={pending}
              >
                Herinner me
              </button>
              <button
                type="button"
                className="btn btn--chip"
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
