import Link from "next/link";
import { prisma, currentUserId } from "@/lib/db/client";
import { getOpenCommitments, type LooseEnd } from "@/lib/commitments";
import { resolveCommitment } from "@/lib/actions";
import { clamp, durationPhrase, formatDayShort } from "@/lib/text";

export const dynamic = "force-dynamic";

/**
 * Open eindjes (§6.2) — de differentiator.
 *
 * Twee secties, want "ik moet iets" en "ik wacht op iemand" vragen een ander
 * soort actie. Elk item heeft drie gelijkwaardige uitgangen; "laat vallen" is
 * bewust net zo makkelijk als "afgehandeld".
 */
export default async function OpenEindjesPage() {
  const userId = await currentUserId();
  const [{ i_owe, they_owe, total }, connectors, everHad] = await Promise.all([
    getOpenCommitments(userId),
    prisma.connector.findMany({ where: { user_id: userId } }),
    prisma.commitment.count({ where: { user_id: userId } }),
  ]);

  // Dezelfde vier staten als Vandaag (§9). Het verschil tussen "dag 1" en
  // "alles afgehandeld" is essentieel: een leeg scherm betekent iets heel
  // anders als je net gekoppeld hebt dan wanneer je net hebt opgeruimd.
  const degraded = connectors.filter(
    (c) => c.status === "error" || c.status === "reauth_required",
  );
  const state: "empty" | "degraded" | "clear" | "normal" =
    everHad === 0 ? "empty" : total === 0 ? "clear" : degraded.length > 0 ? "degraded" : "normal";

  const oldest = [...i_owe, ...they_owe].reduce<string | null>(
    (acc, e) => (acc === null || e.opened_at < acc ? e.opened_at : acc),
    null,
  );

  return (
    <>
      <p className="eyebrow">Losse draden over alle bronnen heen</p>
      <h1 style={{ fontSize: "var(--t-xl)" }}>Open eindjes</h1>

      {state === "empty" ? (
        <div className="empty" style={{ marginTop: "var(--s-5)" }}>
          <strong>Nog niets gevonden.</strong>
          Ik lees mail, agenda en chat pas sinds vandaag. Zodra iemand op je wacht — of jij
          op iemand — staat het hier. <Link href="/onboarding">Meer bronnen koppelen</Link>
        </div>
      ) : state === "clear" ? (
        <div className="rest" style={{ marginTop: "var(--s-5)" }}>
          <h2>Geen losse draden.</h2>
          <p>
            Niemand wacht op jou, jij wacht op niemand. Dit blok hoort leeg te kunnen zijn —
            en dat is het nu.
          </p>
        </div>
      ) : (
        <p className="lede" style={{ marginTop: "var(--s-3)" }}>
          {total} draden. De oudste hangt {durationPhrase(oldest!)}.
        </p>
      )}

      {degraded.length > 0 && (
        <div className="notice notice--signal" style={{ marginTop: "var(--s-4)" }}>
          <span className="notice__mark">Incompleet</span>
          <span>
            {degraded
              .map((c) =>
                clamp(
                  c.error_message ?? `${c.label} was niet bereikbaar.`,
                  "connectorStatus",
                ),
              )
              .join(" ")}{" "}
            Er kunnen dus draden ontbreken.{" "}
            <Link href="/instellingen" className="btn--text">
              Herstellen
            </Link>
          </span>
        </div>
      )}

      <div className="split split--2">
        <Group
          title="Ik moet iets"
          note="belofte gedaan, niet ingelost"
          items={i_owe}
          empty="Niemand wacht op jou."
        />
        <Group
          title="Ik wacht op iemand"
          note="vraag gesteld, geen antwoord"
          items={they_owe}
          empty="Je wacht nergens op."
        />
      </div>
    </>
  );
}

function Group({
  title,
  note,
  items,
  empty,
}: {
  title: string;
  note: string;
  items: LooseEnd[];
  empty: string;
}) {
  return (
    <section className="section">
      <div className="section__head">
        <h2>{title}</h2>
        <span className="section__note">{note}</span>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <strong>{empty}</strong>
          Dat is de bedoeling. Dit blok hoort leeg te kunnen zijn.
        </div>
      ) : (
        <ul className="list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="row">
                <div className="row__body">
                  <span className="row__title">
                    {item.party}: {item.what}
                  </span>
                  {item.context && <span className="row__sub">{item.context}</span>}
                  <div className="chips">
                    <span className="chip">{durationPhrase(item.opened_at)} open</span>
                    <span className="chip">{item.source_label}</span>
                    {item.project && <span className="chip chip--accent">{item.project}</span>}
                    {item.due_date && (
                      <span className="chip">afspraak {formatDayShort(item.due_date)}</span>
                    )}
                  </div>
                  <div className="row__actions">
                    <form action={resolveCommitment.bind(null, item.id, "done", 0)}>
                      <button
                        className="btn btn--quiet"
                        type="submit"
                        aria-label={`Afgehandeld: ${item.party} — ${item.what}`}
                      >
                        Afgehandeld
                      </button>
                    </form>
                    <form action={resolveCommitment.bind(null, item.id, "snoozed", 3)}>
                      <button
                        className="btn btn--quiet"
                        type="submit"
                        aria-label={`Herinner me over 3 dagen: ${item.party} — ${item.what}`}
                      >
                        Herinner me over 3 dagen
                      </button>
                    </form>
                    <form action={resolveCommitment.bind(null, item.id, "dismissed", 0)}>
                      <button
                        className="btn btn--text"
                        type="submit"
                        aria-label={`Laat vallen: ${item.party} — ${item.what}`}
                      >
                        Laat vallen
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
