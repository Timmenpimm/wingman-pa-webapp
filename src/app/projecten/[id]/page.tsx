import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, currentUserId } from "@/lib/db/client";
import { resolveCommitment } from "@/lib/actions";
import { durationPhrase, formatAmount, formatDayShort } from "@/lib/text";

export const dynamic = "force-dynamic";

/**
 * Projectdetail (§6.4): eigen open acties, de mensen eromheen, en wie op wie
 * wacht. Bewust geen tweede dashboard — alleen wat je nodig hebt om te weten
 * wat de volgende stap is.
 */
export default async function ProjectDetail({ params }: { params: { id: string } }) {
  const userId = await currentUserId();
  const project = await prisma.project.findFirst({
    where: { id: params.id, user_id: userId },
  });
  if (!project) notFound();

  const [commitments, transactions] = await Promise.all([
    prisma.commitment.findMany({
      where: { user_id: userId, project_id: project.id },
      orderBy: { opened_at: "asc" },
    }),
    prisma.transaction.findMany({
      where: { user_id: userId, project_id: project.id },
      orderBy: { booked_at: "desc" },
    }),
  ]);

  const open = commitments.filter((c) => c.status === "open" || c.status === "snoozed");
  const iOwe = open.filter((c) => c.direction === "i_owe");
  const theyOwe = open.filter((c) => c.direction === "they_owe");
  const people = Array.from(new Set(open.map((c) => c.party)));

  return (
    <>
      <p className="eyebrow">
        <Link href="/projecten">Projecten</Link>
      </p>
      <h1 style={{ fontSize: "var(--t-xl)" }}>{project.name}</h1>
      {project.status_line && (
        <p className="lede" style={{ marginTop: "var(--s-3)" }}>{project.status_line}</p>
      )}

      <div className="chips">
        <span className="chip">{project.status === "active" ? "loopt" : project.status}</span>
        {people.map((p) => (
          <span key={p} className="chip">{p}</span>
        ))}
      </div>

      <section className="section">
        <div className="section__head">
          <h2>Volgende stap</h2>
          <span className="section__note">{open.length} open</span>
        </div>
        {open.length === 0 ? (
          <div className="empty">
            <strong>Niets open.</strong>
            Er hangt geen enkele draad aan dit project.
          </div>
        ) : (
          <ul className="list">
            {open.map((c) => (
              <li key={c.id}>
                <div className="row">
                  <div className="row__body">
                    <span className="row__title">{c.what}</span>
                    <span className="row__sub">
                      {c.direction === "i_owe" ? `${c.party} wacht op jou` : `jij wacht op ${c.party}`}
                      {" · "}
                      {durationPhrase(c.opened_at)} open
                      {c.due_date ? ` · afspraak ${formatDayShort(c.due_date)}` : ""}
                    </span>
                    <div className="row__actions">
                      <form action={resolveCommitment.bind(null, c.id, "done", 0)}>
                        <button
                          className="btn btn--quiet"
                          type="submit"
                          aria-label={`Afgehandeld: ${c.what}`}
                        >
                          Afgehandeld
                        </button>
                      </form>
                      <form action={resolveCommitment.bind(null, c.id, "dismissed", 0)}>
                        <button
                          className="btn btn--text"
                          type="submit"
                          aria-label={`Laat vallen: ${c.what}`}
                        >
                          Laat vallen
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Wie waarop wacht</h2>
        </div>
        <div className="split split--2">
          <div>
            <p className="meta">Jij bent aan zet</p>
            <ul className="list">
              {iOwe.length === 0 ? (
                <li>
                  <div className="row">
                    <span className="row__sub">Niets.</span>
                  </div>
                </li>
              ) : (
                iOwe.map((c) => (
                  <li key={c.id}>
                    <div className="row">
                      <div className="row__body">
                        <span className="row__title">{c.party}</span>
                        <span className="row__sub">{c.what}</span>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="meta">Je wacht op</p>
            <ul className="list">
              {theyOwe.length === 0 ? (
                <li>
                  <div className="row">
                    <span className="row__sub">Niemand.</span>
                  </div>
                </li>
              ) : (
                theyOwe.map((c) => (
                  <li key={c.id}>
                    <div className="row">
                      <div className="row__body">
                        <span className="row__title">{c.party}</span>
                        <span className="row__sub">
                          {c.what} · {durationPhrase(c.opened_at)} stil
                        </span>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>

      {transactions.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2>Geld</h2>
            <span className="section__note">gekoppeld aan dit project</span>
          </div>
          <ul className="list">
            {transactions.map((t) => (
              <li key={t.id}>
                <div className="row">
                  <div className="row__body">
                    <span className="row__title">{t.counterparty ?? "Onbekend"}</span>
                    <span className="row__sub">{t.description}</span>
                  </div>
                  <span className={`amount${t.amount > 0 ? " amount--in" : ""}`}>
                    {formatAmount(t.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="meta" style={{ marginTop: "var(--s-6)" }}>
        <Link href={`/graaf?q=${encodeURIComponent(project.name)}`}>
          Bekijk {project.name} in de graaf
        </Link>
      </p>
    </>
  );
}
