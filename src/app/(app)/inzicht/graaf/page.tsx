import Link from "next/link";
import { currentUserId } from "@/lib/db/client";
import { queryGraph, SUGGESTED_QUERIES } from "@/lib/graphify/query";

export const dynamic = "force-dynamic";

/**
 * Kennisgraaf (§6.9).
 *
 * Power-user scherm, maar de zoekbalk is vanaf elk scherm bereikbaar. Het
 * resultaat is bewust géén netwerktekening met bolletjes: kaartjes met
 * verbindingen zijn leesbaar op 390 px, een force-directed graph niet.
 *
 * Zoeken gaat via een GET-formulier — geen JavaScript nodig, deelbare URL.
 */
export default async function GraafPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const userId = await currentUserId();
  const q = searchParams.q?.trim();
  const result = q ? await queryGraph(userId, q) : null;

  return (
    <>
      <p className="eyebrow">Verbanden zien</p>
      <h1 className="screen-title">{q ? `Waar hangt ${q} mee samen?` : "Vraag je graaf"}</h1>

      <form className="field" method="get" role="search">
        <input
          className="input"
          name="q"
          defaultValue={q ?? ""}
          placeholder="welke transacties hangen bij dit project?"
          aria-label="Stel een vraag aan je graaf"
        />
        <button className="btn btn--primary" type="submit">
          Zoek
        </button>
      </form>

      {!q && (
        <section className="section">
          <div className="section__head">
            <h2>Uit je eigen context</h2>
            <span className="section__note">voorgestelde vragen</span>
          </div>
          <ul className="list">
            {SUGGESTED_QUERIES.map((s) => (
              <li key={s}>
                <div className="row">
                  <div className="row__body">
                    <Link href={`/graaf?q=${encodeURIComponent(s)}`} className="row__title">
                      {s}
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && (
        <section className="section">
          <div className="section__head">
            <h2>
              {result.nodes.length}{" "}
              {result.nodes.length === 1 ? "resultaat" : "resultaten"}
            </h2>
            <span className="section__note">gelezen als: {result.interpreted}</span>
          </div>

          {result.nodes.length === 0 ? (
            <div className="empty">
              <strong>Niets gevonden.</strong>
              De graaf kent dit begrip nog niet. Probeer een naam van een persoon, project of
              organisatie.
            </div>
          ) : (
            <>
            <div className="graph-network" aria-label={`Verbanden rond ${q}`}>
              {result.nodes.slice(0, 5).map((n, index) => (
                <span key={n.id} className="graph-network__node" data-index={index} data-primary={index === 0}>
                  {n.label}
                </span>
              ))}
            </div>
            <p className="graph-network__caption">
              Deze verbanden komen samen in je eigen context. Open een resultaat voor de details.
            </p>
            <div className="cards graph-results">
              {result.nodes.map((n) => (
                <article key={n.id} className="graph-result">
                  <p className="graph-result__type">{n.type}</p>
                  <h3 className="graph-result__label">{n.label}</h3>
                  {n.summary && <p className="row__sub">{n.summary}</p>}
                  {n.edges.length > 0 && (
                    <ul className="graph-edges">
                      {n.edges.map((e, i) => (
                        <li key={i}>
                          <code>{e.type}</code> {e.to}
                          {e.label ? ` · ${e.label}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
            </>
          )}
        </section>
      )}

      <p className="meta" style={{ marginTop: "var(--s-6)" }}>
        De graaf staat per gebruiker apart, in de EU, versleuteld. Er wordt niet op getraind.
      </p>
    </>
  );
}
