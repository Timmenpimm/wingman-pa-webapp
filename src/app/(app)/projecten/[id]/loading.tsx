import "../../loading.css";

/**
 * Skeleton voor een projectdetail — kop met chips, "volgende stap"-lijst en
 * de twee kolommen "wie waarop wacht". De geldsectie is optioneel (alleen bij
 * gekoppelde transacties) en krijgt daarom geen plek in de skeleton — die zou
 * er bij de meeste projecten nooit uitzien zoals gereserveerd.
 */
export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">Bezig met laden.</span>
      <div aria-hidden="true">
        <span className="ld-bone" style={{ width: "5rem", height: "0.6875rem" }} />
        <span
          className="ld-bone"
          style={{ width: "55%", height: "1.75rem", marginTop: "var(--s-1)" }}
        />
        <span
          className="ld-bone"
          style={{ width: "70%", height: "0.9375rem", marginTop: "var(--s-3)" }}
        />

        <div className="chips">
          {["4rem", "5.5rem", "3.5rem"].map((w, i) => (
            <span key={i} className="chip" style={{ display: "inline-flex" }}>
              <span className="ld-bone" style={{ width: w, height: "0.75rem" }} />
            </span>
          ))}
        </div>

        <section className="section">
          <div className="section__head">
            <span className="ld-bone" style={{ width: "7rem", height: "1rem" }} />
            <span className="ld-bone" style={{ width: "3rem", height: "0.6875rem" }} />
          </div>
          <ul className="list">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <div className="row">
                  <div className="row__body">
                    <span className="ld-bone" style={{ width: `${72 - i * 6}%`, height: "0.9375rem" }} />
                    <span
                      className="ld-bone"
                      style={{ width: "50%", height: "0.75rem", marginTop: "var(--s-1)" }}
                    />
                    <div className="row__actions">
                      <span
                        className="ld-bone ld-bone--pill"
                        style={{ width: "6rem", height: "1.75rem" }}
                      />
                      <span
                        className="ld-bone ld-bone--pill"
                        style={{ width: "5rem", height: "1.25rem" }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="section">
          <div className="section__head">
            <span className="ld-bone" style={{ width: "10rem", height: "1rem" }} />
          </div>
          <div className="split split--2">
            {[0, 1].map((col) => (
              <div key={col}>
                <span className="ld-bone" style={{ width: "5rem", height: "0.75rem" }} />
                <ul className="list" style={{ marginTop: "var(--s-2)" }}>
                  {[0, 1].map((i) => (
                    <li key={i}>
                      <div className="row">
                        <div className="row__body">
                          <span
                            className="ld-bone"
                            style={{ width: "45%", height: "0.9375rem" }}
                          />
                          <span
                            className="ld-bone"
                            style={{ width: "65%", height: "0.75rem", marginTop: "var(--s-1)" }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
