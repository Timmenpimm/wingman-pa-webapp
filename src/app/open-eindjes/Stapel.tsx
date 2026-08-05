"use client";

import { useState, useTransition } from "react";
import { resolveCommitment } from "@/lib/actions";
import { durationPhrase } from "@/lib/text";
import type { LooseEnd } from "@/lib/commitments";

/** Zie page.tsx voor dezelfde constante — bewust gedupliceerd, zie de
 *  toelichting daar. */
const SNOOZE_DAYS = 3;

type Kind = "done" | "later" | "drop";
type Tally = Record<Kind, number>;

/* Avatarkleur per persoon: geen nieuwe kleuren, alleen bestaande tokens
   gemengd in een paar vaste verhoudingen. De keuze is deterministisch op
   naam, zodat dezelfde persoon altijd dezelfde kleur krijgt. */
const AVATAR_BACKGROUNDS = [
  "color-mix(in srgb, var(--accent) 55%, var(--paper-raised))",
  "color-mix(in srgb, var(--signal) 55%, var(--paper-raised))",
  "color-mix(in srgb, var(--accent) 30%, var(--signal) 45%)",
  "color-mix(in srgb, var(--accent-strong) 60%, var(--paper-raised))",
  "color-mix(in srgb, var(--ink-faint) 70%, var(--paper-raised))",
  "color-mix(in srgb, var(--signal) 30%, var(--accent) 40%)",
];

function avatarBackground(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_BACKGROUNDS[hash % AVATAR_BACKGROUNDS.length];
}

function tallyLine(t: Tally): string {
  const parts: string[] = [];
  if (t.done) parts.push(`${t.done} afgehandeld`);
  if (t.later) parts.push(`${t.later} op later gezet`);
  if (t.drop) parts.push(`${t.drop} laten vallen`);
  if (parts.length === 0) return "Je hebt ze allemaal gezien.";
  const head =
    parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " en " + parts[parts.length - 1];
  const tail = t.drop
    ? " Dat laatste telt net zo hard."
    : t.later
      ? " Wat je later doet, kom ik nog eens terugvragen."
      : "";
  return head.charAt(0).toUpperCase() + head.slice(1) + "." + tail;
}

/**
 * Eén kaart tegelijk (ontwerp: Wingman-v2.dc.html, LOOSE/advance/cardLeaving).
 * De acties roepen de bestaande server action resolveCommitment() direct aan
 * via useTransition — geen <form>, dus dit blok werkt alleen met JS. De
 * gewone lijst-met-formulieren in page.tsx (achter <noscript>) is de
 * terugval zonder JavaScript.
 */
export function Stapel({ items }: { items: LooseEnd[] }) {
  const [idx, setIdx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [tally, setTally] = useState<Tally>({ done: 0, later: 0, drop: 0 });
  const [, startTransition] = useTransition();

  const total = items.length;
  const current = items[idx];
  const finished = idx >= total || !current;

  function advance(kind: Kind) {
    if (leaving || !current) return;
    const id = current.id;
    setLeaving(true);

    startTransition(() => {
      void (async () => {
        if (kind === "done") await resolveCommitment(id, "done", 0);
        else if (kind === "drop") await resolveCommitment(id, "dismissed", 0);
        else await resolveCommitment(id, "snoozed", SNOOZE_DAYS);
      })();
    });

    // Kaart een kort schuif-en-vervaag-momentje geven vóór de volgende
    // verschijnt (translateY(-16px) scale(0.98) → opacity 0, zie globals.css
    // .loose-card--leaving). prefers-reduced-motion zet dat momentje uit.
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(
      () => {
        setTally((t) => ({ ...t, [kind]: t[kind] + 1 }));
        setIdx((i) => i + 1);
        setLeaving(false);
      },
      reducedMotion ? 0 : 200,
    );
  }

  if (finished) {
    return (
      <div className="rest" style={{ marginTop: "var(--s-6)" }}>
        <h2>Alle {total} zijn langs geweest.</h2>
        <p>{tallyLine(tally)}</p>
      </div>
    );
  }

  // "Ik wacht op" wanneer ik op iemand anders wacht (they_owe); "Ik moet
  // iets" wanneer de bal bij mij ligt (i_owe). Zelfde onderscheid als de
  // oude twee kolommen, nu als kop die per kaart meewisselt.
  const isWaiting = current.direction === "they_owe";
  const heading = isWaiting ? "Ik wacht op" : "Ik moet iets";
  const sub = isWaiting ? "Dit vraagt jouw aandacht." : "Hier ligt de bal bij jou.";
  const primaryLabel = isWaiting ? "Herinner" : "Afgehandeld";
  const ageSuffix = isWaiting ? "stil" : "open";
  const initial = current.party.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="loose-stack">
      {/* Balkje en teller horen bij elkaar en staan bovenaan: onderaan viel de
          teller onder de vouw, en dan is de voortgang alleen nog kleur. */}
      <div className="loose-progress" aria-hidden="true">
        {items.map((it, i) => (
          <span
            key={it.id}
            className="loose-progress__seg"
            data-state={i < idx ? "done" : i === idx ? "current" : "todo"}
          />
        ))}
      </div>

      <p className="loose-counter">
        {Math.min(idx + 1, total)} van {total}
      </p>

      <div className="loose-head">
        <h2 className="loose-head__title">{heading}</h2>
        <p className="loose-head__sub">{sub}</p>
      </div>

      <article
        className={`loose-card${leaving ? " loose-card--leaving" : ""}`}
        aria-live="polite"
        aria-busy={leaving}
      >
        <span
          className="loose-card__avatar"
          style={{ background: avatarBackground(current.party) }}
          aria-hidden="true"
        >
          {initial}
        </span>
        <p className="loose-card__party">{current.party}</p>
        <h3 className="loose-card__what">{current.what}</h3>
        <p className="loose-card__meta loose-card__meta--age">
          {durationPhrase(current.opened_at)} {ageSuffix}
        </p>
        <p className="loose-card__meta loose-card__meta--source">{current.source_label}</p>
        {current.context && <p className="loose-card__story">{current.context}</p>}
      </article>

      <div className="loose-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => advance("done")}
          disabled={leaving}
          aria-label={`${primaryLabel}: ${current.party} — ${current.what}`}
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => advance("later")}
          disabled={leaving}
          aria-label={`Later: ${current.party} — ${current.what}`}
        >
          Later
        </button>
        <button
          type="button"
          className="btn btn--text"
          onClick={() => advance("drop")}
          disabled={leaving}
          aria-label={`Laat vallen: ${current.party} — ${current.what}`}
        >
          Laat vallen
        </button>
      </div>

    </div>
  );
}
