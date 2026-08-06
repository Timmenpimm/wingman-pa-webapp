import Link from "next/link";
import { currentUserId, withUser } from "@/lib/db/client";
import { getOpenCommitments } from "@/lib/commitments";

export const dynamic = "force-dynamic";

/**
 * Projecten (§6.4) — bewust laag in de hiërarchie. De agenda is het overzicht,
 * dit scherm niet. Eén statusregel per project, klaar.
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
      <p className="eyebrow">Wat er loopt</p>
      <h1 className="screen-title">Projecten</h1>

      <div className="project-panel">
        {projects.map((p, index) => (
          <article key={p.id} className="project-row">
            <span className="project-row__dot" data-tone={index % 4} aria-hidden="true" />
            <div className="project-row__body">
              <h2>
                <Link href={`/projecten/${p.id}`}>{p.name}</Link>
              </h2>
              <p>{p.status_line ?? STATUS[p.status]}</p>
              {openPer.get(p.name) ? (
                <span className="project-row__meta">{openPer.get(p.name)} open eindje(s)</span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
