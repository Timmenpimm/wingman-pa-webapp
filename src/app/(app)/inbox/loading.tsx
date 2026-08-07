import "../loading.css";

/**
 * Skeleton voor Inbox — kop met teller, drie triagekaarten met vier
 * chipknoppen, capture-veld onderaan. Bootst de kaartvorm na zodat de vier
 * uitgangen (frog/prioriteit/open eindje/verwijder) niet later pas
 * verschijnen als een sprong.
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
              style={{ width: "8rem", height: "1.75rem", marginTop: "var(--s-1)" }}
            />
          </div>
          <span
            className="ld-bone"
            style={{ width: "3.5rem", height: "0.6875rem", marginTop: "2px" }}
          />
        </div>
        <span
          className="ld-bone"
          style={{ width: "70%", height: "0.9375rem", marginTop: "var(--s-2)" }}
        />

        <ul className="action-cards">
          {[0, 1, 2].map((i) => (
            <li key={i} className="action-card">
              <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "flex-start" }}>
                <span className="ld-bone ld-bone--circle" style={{ width: "1.75rem", height: "1.75rem" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="ld-bone" style={{ width: `${80 - i * 10}%`, height: "1rem" }} />
                  <span
                    className="ld-bone"
                    style={{ width: "45%", height: "0.8125rem", marginTop: "var(--s-1)" }}
                  />
                </div>
              </div>
              <div className="row__actions">
                {[0, 1, 2, 3].map((chip) => (
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

        <section className="section">
          <div className="section__head">
            <span className="ld-bone" style={{ width: "6rem", height: "1rem" }} />
            <span className="ld-bone" style={{ width: "5rem", height: "0.6875rem" }} />
          </div>
          <div className="field">
            <div className="input" style={{ flex: 1, height: "2.75rem" }} />
            <span
              className="ld-bone ld-bone--pill"
              style={{ width: "5.5rem", height: "2.75rem" }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
