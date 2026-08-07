import "./loading.css";

/**
 * Skeleton voor Vandaag — de homepage van de route-groep. Dit is de eerste
 * tik die iemand op de bodemnavigatie doet, en de plek waar "geen reactie
 * tot de server antwoordt" het hardst opvalt. Vult daarom meteen de vorm
 * van de normale staat (kop, frog, drie prioriteiten, agenda) in plaats van
 * een lege pagina te laten zien tot de echte data er is.
 */
export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">Bezig met laden.</span>
      <div aria-hidden="true">
        <span className="ld-bone" style={{ width: "7rem", height: "0.6875rem" }} />
        <span
          className="ld-bone"
          style={{ width: "60%", height: "1.75rem", marginTop: "var(--s-1)" }}
        />
        <span
          className="ld-bone"
          style={{ width: "85%", height: "0.9375rem", marginTop: "var(--s-2)" }}
        />

        {/* De frog-kaart is het zwaarste element op het scherm — die vorm
            moet meteen kloppen, anders springt alles onder de vouw. */}
        <section className="frog">
          <span className="ld-bone" style={{ width: "30%", height: "0.6875rem" }} />
          <span
            className="ld-bone"
            style={{ width: "80%", height: "1.75rem", marginTop: "var(--s-3)" }}
          />
          <span
            className="ld-bone"
            style={{ width: "50%", height: "1.75rem", marginTop: "var(--s-2)" }}
          />
          <div className="frog__actions">
            <span
              className="ld-bone ld-bone--pill"
              style={{ width: "5.5rem", height: "2.75rem" }}
            />
            <span
              className="ld-bone ld-bone--pill"
              style={{ width: "6.5rem", height: "1.25rem" }}
            />
          </div>
        </section>

        <div style={{ marginTop: "var(--s-6)" }} className="today-priorities">
          <span className="ld-bone" style={{ width: "40%", height: "0.6875rem" }} />
          <ul className="list" style={{ marginTop: "var(--s-2)" }}>
            {[70, 55, 62].map((w, i) => (
              <li key={i}>
                <div className="row row--button">
                  <span className="check" />
                  <span className="row__body">
                    <span className="ld-bone" style={{ width: `${w}%`, height: "0.9375rem" }} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ marginTop: "var(--s-6)" }} className="today-agenda">
          <span className="ld-bone" style={{ width: "28%", height: "0.6875rem" }} />
          <ul className="timeline" style={{ marginTop: "var(--s-2)" }}>
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <span className="ld-bone" style={{ width: "3rem", height: "0.75rem" }} />
                <div>
                  <span className="ld-bone" style={{ width: "75%", height: "0.9375rem" }} />
                  <span
                    className="ld-bone"
                    style={{ width: "35%", height: "0.75rem", marginTop: "var(--s-1)" }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="field" style={{ marginTop: "var(--s-6)" }}>
          <div className="input" style={{ height: "2.75rem" }} />
        </div>
      </div>
    </div>
  );
}
