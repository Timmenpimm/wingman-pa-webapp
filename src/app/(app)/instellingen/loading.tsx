import "../loading.css";

/**
 * Skeleton voor Instellingen — het langste scherm van de app. Bootst alleen
 * de eerste, altijd-aanwezige blokken na (profiel, bronnen, connectorstatus,
 * regels, gegevens): de optionele "Wil je dit?"-sectie verschijnt soms wel
 * en soms niet, en hoeft geen plek te reserveren die er niet altijd is.
 */
export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">Bezig met laden.</span>
      <div aria-hidden="true">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="ld-bone" style={{ width: "6rem", height: "0.6875rem" }} />
          <span className="ld-bone" style={{ width: "5rem", height: "0.6875rem" }} />
        </div>
        <span
          className="ld-bone"
          style={{ width: "9rem", height: "1.75rem", marginTop: "var(--s-1)" }}
        />

        <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "center", marginTop: "var(--s-4)" }}>
          <span
            className="ld-bone ld-bone--circle"
            style={{ width: "2.75rem", height: "2.75rem" }}
          />
          <div>
            <span className="ld-bone" style={{ width: "8rem", height: "0.9375rem" }} />
            <span
              className="ld-bone"
              style={{ width: "10rem", height: "0.75rem", marginTop: "var(--s-1)" }}
            />
          </div>
        </div>

        <section style={{ marginTop: "var(--s-6)" }}>
          <span className="ld-bone" style={{ width: "9rem", height: "0.6875rem" }} />
          <ul style={{ listStyle: "none", margin: "var(--s-2) 0 0", padding: 0 }}>
            {[0, 1, 2].map((i) => (
              <li key={i} className="conn">
                <span
                  className="ld-bone ld-bone--circle"
                  style={{ width: "1.75rem", height: "1.75rem" }}
                />
                <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                  <span className="ld-bone" style={{ width: "60%", height: "0.9375rem" }} />
                  <span
                    className="ld-bone"
                    style={{ width: "80%", height: "0.75rem", marginTop: "var(--s-1)" }}
                  />
                </div>
                <span
                  className="ld-bone"
                  style={{ width: "9.5rem", height: "2rem", flex: "0 0 auto" }}
                />
              </li>
            ))}
          </ul>
        </section>

        <section style={{ marginTop: "var(--s-6)" }}>
          <span className="ld-bone" style={{ width: "9rem", height: "0.6875rem" }} />
          <div className="connector-summary" style={{ marginTop: "var(--s-2)" }}>
            <span className="ld-bone" style={{ width: "8rem", height: "1rem" }} />
            <span className="ld-bone" style={{ width: "70%", height: "0.9375rem" }} />
          </div>
        </section>

        <section style={{ marginTop: "var(--s-6)" }}>
          <span className="ld-bone" style={{ width: "7rem", height: "0.6875rem" }} />
          <ul style={{ listStyle: "none", margin: "var(--s-2) 0 0", padding: 0 }}>
            {[0, 1].map((i) => (
              <li key={i} className="row" style={{ paddingInline: 0 }}>
                <div className="row__body">
                  <span className="ld-bone" style={{ width: "50%", height: "0.9375rem" }} />
                  <span
                    className="ld-bone"
                    style={{ width: "35%", height: "0.75rem", marginTop: "var(--s-1)" }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section style={{ marginTop: "var(--s-6)" }}>
          <span className="ld-bone" style={{ width: "7rem", height: "0.6875rem" }} />
          <span
            className="ld-bone"
            style={{ width: "90%", height: "0.9375rem", marginTop: "var(--s-3)" }}
          />
          <span
            className="ld-bone"
            style={{ width: "60%", height: "0.9375rem", marginTop: "var(--s-2)" }}
          />
          <div className="btn-row" style={{ marginTop: "var(--s-4)" }}>
            <span
              className="ld-bone ld-bone--pill"
              style={{ width: "8rem", height: "2.5rem" }}
            />
            <span
              className="ld-bone ld-bone--pill"
              style={{ width: "7rem", height: "2.5rem" }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
