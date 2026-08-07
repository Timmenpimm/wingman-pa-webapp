import "../loading.css";

/**
 * Skeleton voor Projecten — één paneel met rijen (statuspunt, naam,
 * statusregel), zoals het echte overzicht. Vier rijen is een redelijke
 * gok voor de meeste gebruikers; te veel rijen gokken maakt de sprong bij
 * weinig projecten juist groter.
 */
export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">Bezig met laden.</span>
      <div aria-hidden="true">
        <span className="ld-bone" style={{ width: "9rem", height: "0.6875rem" }} />
        <span
          className="ld-bone"
          style={{ width: "8rem", height: "1.75rem", marginTop: "var(--s-1)" }}
        />

        <div className="project-panel">
          {[70, 55, 65, 48].map((w, i) => (
            <div key={i} className="project-row">
              <span
                className="ld-bone ld-bone--circle"
                style={{ width: "0.75rem", height: "0.75rem", marginTop: "0.4rem" }}
              />
              <div className="project-row__body">
                <span className="ld-bone" style={{ width: `${w}%`, height: "1rem" }} />
                <span
                  className="ld-bone"
                  style={{ width: "40%", height: "0.8125rem", marginTop: "var(--s-1)" }}
                />
              </div>
            </div>
          ))}
        </div>

        <span
          className="ld-bone"
          style={{ width: "90%", height: "0.9375rem", marginTop: "var(--s-5)" }}
        />
      </div>
    </div>
  );
}
