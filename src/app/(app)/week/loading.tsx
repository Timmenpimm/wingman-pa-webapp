import "../loading.css";

/**
 * Skeleton voor het weekoverzicht — dagenstrip, twee patroonkaarten en twee
 * lijsten. Zeven dagcellen staat vast (een week is een week); de lijsten
 * eronder gokken op de gebruikelijke lengte uit de referentie.
 */
export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">Bezig met laden.</span>
      <div aria-hidden="true">
        <span className="ld-bone" style={{ width: "9rem", height: "0.6875rem" }} />
        <span
          className="ld-bone"
          style={{ width: "65%", height: "1.75rem", marginTop: "var(--s-1)" }}
        />
        <span
          className="ld-bone"
          style={{ width: "70%", height: "0.9375rem", marginTop: "var(--s-2)" }}
        />

        <div className="wk-days" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              className="wk-day"
              style={{ display: "grid", placeItems: "center", gap: "var(--s-2)" }}
            >
              <span className="ld-bone" style={{ width: "1.1rem", height: "0.6875rem" }} />
              <span
                className="ld-bone ld-bone--circle"
                style={{ width: "0.375rem", height: "0.375rem" }}
              />
            </span>
          ))}
        </div>

        <div className="wk-insights">
          {[0, 1].map((i) => (
            <article key={i} className="wk-insight">
              <span
                className="ld-bone ld-bone--circle"
                style={{ width: "1.25rem", height: "1.25rem", marginTop: "2px" }}
              />
              <div>
                <span className="ld-bone" style={{ width: "10rem", height: "1rem" }} />
                <span
                  className="ld-bone"
                  style={{ width: "14rem", height: "0.9375rem", marginTop: "var(--s-2)" }}
                />
              </div>
            </article>
          ))}
        </div>

        {[3, 4].map((rows, section) => (
          <section key={section} className="section">
            <div className="section__head">
              <span className="ld-bone" style={{ width: "8rem", height: "1rem" }} />
              <span className="ld-bone" style={{ width: "6rem", height: "0.6875rem" }} />
            </div>
            <ul className="list">
              {Array.from({ length: rows }).map((_, i) => (
                <li key={i}>
                  <div className="row">
                    <div className="row__body">
                      <span
                        className="ld-bone"
                        style={{ width: `${68 - i * 6}%`, height: "0.9375rem" }}
                      />
                      <span
                        className="ld-bone"
                        style={{ width: "45%", height: "0.75rem", marginTop: "var(--s-1)" }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
