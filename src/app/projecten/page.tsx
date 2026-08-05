import Link from "next/link";
import { prisma, currentUserId } from "@/lib/db/client";
import { getOpenCommitments } from "@/lib/commitments";

export const dynamic = "force-dynamic";

/**
 * Projecten (§6.4) — bewust laag in de hiërarchie. De agenda is het overzicht,
 * dit scherm niet. Eén statusregel per project, klaar.
 */
export default async function ProjectenPage() {
  const userId = await currentUserId();
  const [projects, looseEnds] = await Promise.all([
    prisma.project.findMany({ where: { user_id: userId }, orderBy: { status: "asc" } }),
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
      <h1 style={{ fontSize: "var(--t-xl)" }}>Projecten</h1>

      <div className="cards cards--2" style={{ marginTop: "var(--s-5)" }}>
        {projects.map((p) => (
          <article key={p.id} className="card">
            <h2 className="card__title">
              <Link href={`/projecten/${p.id}`}>{p.name}</Link>
            </h2>
            <p className="card__line">{p.status_line ?? STATUS[p.status]}</p>
            <div className="chips">
              <span className="chip">{STATUS[p.status] ?? p.status}</span>
              {openPer.get(p.name) ? (
                <span className="chip chip--accent">{openPer.get(p.name)} open eindje(s)</span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
