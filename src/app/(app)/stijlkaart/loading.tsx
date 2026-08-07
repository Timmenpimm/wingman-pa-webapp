import "../loading.css";

/**
 * Skeleton voor de stijlkaart — drie registerkaarten met titel en
 * voorbeeldzin. Altijd precies drie (bekenden/zakelijk/instanties), dus deze
 * skeleton mag daar exact op gokken zonder marge voor "hoeveel worden het er".
 */
export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">Bezig met laden.</span>
      <div aria-hidden="true">
        <span className="ld-bone" style={{ width: "9rem", height: "0.6875rem" }} />
        <span
          className="ld-bone"
          style={{ width: "9.5rem", height: "1.75rem", marginTop: "var(--s-1)" }}
        />
        <span
          className="ld-bone"
          style={{ width: "80%", height: "0.9375rem", marginTop: "var(--s-2)" }}
        />

        <div className="style-registers">
          {[0, 1, 2].map((i) => (
            <article key={i} className="style-register">
              <span className="ld-bone" style={{ width: "40%", height: "1rem" }} />
              <span
                className="ld-bone"
                style={{ width: "85%", height: "0.9375rem", marginTop: "var(--s-2)" }}
              />
              <span
                className="ld-bone"
                style={{ width: "60%", height: "0.9375rem", marginTop: "var(--s-1)" }}
              />
              <span
                className="ld-bone"
                style={{ width: "5rem", height: "0.6875rem", marginTop: "var(--s-3)" }}
              />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
