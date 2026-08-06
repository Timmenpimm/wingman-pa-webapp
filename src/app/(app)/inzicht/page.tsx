import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { currentUserId } from "@/lib/db/client";
import { queryGraph, SUGGESTED_QUERIES } from "@/lib/graphify/query";
import "./screen.css";

export const dynamic = "force-dynamic";

/**
 * Inzichtspagina: verbind verschillende delen van je data.
 *
 * Het resultaat is een netwerkje van kaartjes op vaste posities: de kern in
 * het accent, satellieten eromheen, dunne lijnen ertussen. Vaste posities in
 * plaats van een force-layout — op 390 px is voorspelbaarheid leesbaarder,
 * en er komt geen graafbibliotheek aan te pas.
 *
 * Zoeken gaat via een GET-formulier — geen JavaScript nodig, deelbare URL.
 */

const CENTER = { x: 55, y: 46 };
const SATELLITE_POS = [
  { x: 22, y: 15 },
  { x: 75, y: 20 },
  { x: 24, y: 77 },
  { x: 72, y: 75 },
  { x: 50, y: 91 },
];
/** De vijfde satelliet zweeft los, zoals in de referentie. */
const LINKED_SATELLITES = 4;

export default async function GraafPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const userId = await currentUserId();
  const q = searchParams.q?.trim();
  const result = q ? await queryGraph(userId, q) : null;
  const central = result?.nodes[0] ?? null;
  const satellites = result ? result.nodes.slice(1, 1 + SATELLITE_POS.length) : [];

  return (
    <>
      <p className="eyebrow">Verbanden zien</p>
      {/* Een getypte vraag is zelf al de kop; alleen een kale term krijgt de
          "Waar hangt … mee samen?"-mal, anders ontstaat een dubbele vraagzin. */}
      <h1 className="screen-title">
        {q ? (/\?\s*$/.test(q) ? q : `Waar hangt ${q} mee samen?`) : "Vraag je verbindingen"}
      </h1>

      {(!q || (result && result.nodes.length === 0)) && (
        <form className="iz-search" method="get" role="search">
          <MagnifyingGlass className="iz-search__icon" aria-hidden="true" />
          <input
            className="iz-search__input"
            name="q"
            defaultValue={q ?? ""}
            placeholder="welke transacties hangen bij dit project?"
            aria-label="Stel een vraag aan je inzicht"
          />
          <button className="btn btn--primary" type="submit">
            Zoek
          </button>
        </form>
      )}

      {!q && (
        <section className="section">
          <div className="iz-sec__head">
            <h2 className="iz-overline">Uit je eigen context</h2>
            <span className="iz-sec__note">voorgestelde vragen</span>
          </div>
          <ul className="iz-suggest">
            {SUGGESTED_QUERIES.map((s) => (
              <li key={s}>
                <Link href={`?q=${encodeURIComponent(s)}`} className="iz-suggest__card">
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && result.nodes.length === 0 && (
        <div className="iz-empty">
          <strong>Niets gevonden.</strong>
          De datakoppeling kent dit begrip nog niet. Probeer een naam van een persoon,
          project of organisatie.
        </div>
      )}

      {result && central && (
        <>
          <figure className="iz-net" aria-label={`Verbanden rond ${q}`}>
            <svg
              className="iz-net__lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {satellites.slice(0, LINKED_SATELLITES).map((n, i) => (
                <line
                  key={n.id}
                  x1={CENTER.x}
                  y1={CENTER.y}
                  x2={SATELLITE_POS[i].x}
                  y2={SATELLITE_POS[i].y}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {satellites.map((n, i) => (
              <span
                key={n.id}
                className="iz-net__node"
                style={{ left: `${SATELLITE_POS[i].x}%`, top: `${SATELLITE_POS[i].y}%` }}
              >
                {n.label}
              </span>
            ))}
            <span
              className="iz-net__node iz-net__node--center"
              style={{ left: `${CENTER.x}%`, top: `${CENTER.y}%` }}
            >
              {central.label}
            </span>
          </figure>

          <p className="iz-caption">
            Deze verbanden komen samen in je eigen context. Open een resultaat voor de
            details.
          </p>

          <section className="section">
            <div className="iz-sec__head">
              <h2 className="iz-overline">
                {result.nodes.length}{" "}
                {result.nodes.length === 1 ? "resultaat" : "resultaten"}
              </h2>
              <span className="iz-sec__note">gelezen als: {result.interpreted}</span>
            </div>
            <div className="iz-results">
              {result.nodes.map((n) => (
                <article key={n.id} className="iz-result">
                  <p className="iz-result__type">{n.type}</p>
                  <h3 className="iz-result__label">{n.label}</h3>
                  {n.summary && <p className="iz-result__sub">{n.summary}</p>}
                  {n.edges.length > 0 && (
                    <ul className="iz-edges">
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
          </section>
        </>
      )}

      <p className="meta" style={{ marginTop: "var(--s-6)" }}>
        De data staat per gebruiker apart, in de EU, versleuteld. Er wordt niet op
        getraind.
      </p>
    </>
  );
}
