import Link from "next/link";
import { currentUserId, withUser } from "@/lib/db/client";
import { getOpenCommitments } from "@/lib/commitments";
import "./screen.css";

export const dynamic = "force-dynamic";

/**
 * Projecten (§6.4, design-reference/screens/14.png) — bewust laag in de
 * hiërarchie. De agenda is het overzicht, dit scherm niet. Eén kaart met
 * compacte rijen: statuspunt, naam, één statusregel.
 */
export default async function ProjectenPage() {
  const userId = await currentUserId();
  // getOpenCommitments() wikkelt zichzelf al in withUser() (eigen transactie);
  // de projectquery hier krijgt zijn eigen, kortere transactie.
  const [projects, looseEnds] = await Promise.all([
    withUser(userId, (tx) =>
      tx.project.findMany({ where: { user_id: userId }, orderBy: { status: "asc" } }),
    ),
    getOpenCommitments(userId),
  ]);

  const openPer = new Map<string, number>();
  for (const e of [...looseEnds.i_owe, ...looseEnds.they_owe]) {
    if (e.project) openPer.set(e.project, (openPer.get(e.project) ?? 0) + 1);
  }

  const STATUS: Record<string, string> = {
    active: "loopt",
    on_hold: "stil",
    done: "afgerond",
    archived: "archief",
  };

  return (
    <>
      <p className="eyebrow">Waar je aandacht woont</p>
      <h1 className="screen-title">Projecten</h1>

      <div className="pj-panel">
        {projects.map((p, index) => (
          <article key={p.id} className="pj-row">
            <span className="pj-row__dot" data-tone={index % 4} aria-hidden="true" />
            <div className="pj-row__body">
              <h2>
                <Link href={`/projecten/${p.id}`}>{p.name}</Link>
              </h2>
              <p className="pj-row__status">{p.status_line ?? STATUS[p.status]}</p>
              {openPer.get(p.name) ? (
                <span className="pj-row__meta">
                  {openPer.get(p.name) === 1
                    ? "1 open eindje"
                    : `${openPer.get(p.name)} open eindjes`}
                </span>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <p className="pj-rest">
        Een project blijft klein genoeg om te bewegen, groot genoeg om richting te geven.
      </p>
    </>
  );
}
