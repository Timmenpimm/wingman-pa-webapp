import "../loading.css";

/**
 * Skeleton voor Inzicht — de beginstaat (zoekveld + voorgestelde vragen), niet
 * het resultatennetwerk. Dat netwerk bestaat pas na een echte vraag; wie hier
 * voor het eerst komt ziet altijd eerst het zoekveld, dus dat is de vorm die
 * moet kloppen bij de eerste tik.
 */
export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">Bezig met laden.</span>
      <div aria-hidden="true">
        <span className="ld-bone" style={{ width: "8rem", height: "0.6875rem" }} />
        <span
          className="ld-bone"
          style={{ width: "70%", height: "1.75rem", marginTop: "var(--s-1)" }}
        />

        <div className="field" style={{ marginTop: "var(--s-4)" }}>
          <div className="input" style={{ flex: 1, height: "2.75rem" }} />
          <span
            className="ld-bone ld-bone--pill"
            style={{ width: "4.5rem", height: "2.75rem" }}
          />
        </div>

        <section className="section">
          <div className="section__head">
            <span className="ld-bone" style={{ width: "10rem", height: "0.75rem" }} />
            <span className="ld-bone" style={{ width: "6rem", height: "0.6875rem" }} />
          </div>
          <div className="cards">
            {[78, 62, 70].map((w, i) => (
              <div key={i} className="card">
                <span className="ld-bone" style={{ width: `${w}%`, height: "0.9375rem" }} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
