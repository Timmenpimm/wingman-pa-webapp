import "../loading.css";

/**
 * Skeleton voor Open eindjes — kop met filterknopje, drie losse-draadkaarten
 * met drie chipknoppen. Zelfde kaartvorm als Inbox: allebei tonen items als
 * losse kaarten met acties eronder, geen tabel.
 */
export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">Bezig met laden.</span>
      <div aria-hidden="true">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--s-3)" }}>
          <div>
            <span className="ld-bone" style={{ width: "7rem", height: "0.6875rem" }} />
            <span
              className="ld-bone"
              style={{ width: "9rem", height: "1.75rem", marginTop: "var(--s-1)" }}
            />
          </div>
          <span className="ld-bone" style={{ width: "2.5rem", height: "2.5rem" }} />
        </div>
        <span
          className="ld-bone"
          style={{ width: "80%", height: "0.9375rem", marginTop: "var(--s-2)" }}
        />

        <ul className="action-cards">
          {[0, 1, 2].map((i) => (
            <li key={i} className="action-card">
              <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "flex-start" }}>
                <span
                  className="ld-bone ld-bone--circle"
                  style={{ width: "1.75rem", height: "1.75rem" }}
                />
                <span className="ld-bone" style={{ width: `${75 - i * 8}%`, height: "1rem" }} />
              </div>
              <span
                className="ld-bone"
                style={{ width: "55%", height: "0.75rem", marginTop: "var(--s-2)" }}
              />
              <div className="row__actions">
                {[0, 1, 2].map((chip) => (
                  <span
                    key={chip}
                    className="ld-bone ld-bone--pill"
                    style={{ flex: 1, height: "1.75rem" }}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
