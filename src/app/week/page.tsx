import { prisma, currentUserId } from "@/lib/db/client";
import { getOpenCommitments } from "@/lib/commitments";
import { durationPhrase } from "@/lib/text";

export const dynamic = "force-dynamic";

/**
 * Weekoverzicht (§6.5) — patronen, geen cijfers.
 *
 * Geen score, geen percentage, geen streak. Als dit scherm scoreboard-achtig
 * voelt is het ontwerp mislukt, dus staat er letterlijk geen enkel getal dat je
 * met vorige week kunt vergelijken. Wel: wat schuift door, en hoe lang al.
 */
export default async function WeekPage() {
  const userId = await currentUserId();
  const [{ i_owe, they_owe }, briefings] = await Promise.all([
    getOpenCommitments(userId),
    prisma.dailyBriefing.findMany({
      where: { user_id: userId },
      orderBy: { date: "desc" },
      take: 7,
    }),
  ]);

  const langstlopend = [...i_owe, ...they_owe]
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at))
    .slice(0, 4);

  return (
    <>
      <p className="eyebrow">Deze week</p>
      <h1 style={{ fontSize: "var(--t-xl)" }}>Wat er terugkomt</h1>

      <p className="coach" style={{ marginTop: "var(--s-5)" }}>
        {langstlopend.length > 0
          ? `"${langstlopend[0].what}" hangt nu ${durationPhrase(
              langstlopend[0].opened_at,
            )}. Dat is geen tijdgebrek — het is een taak die telkens net niet aan de beurt komt. Zet hem één keer als frog, dan is hij weg.`
          : "Niets schuift door deze week."}
      </p>

      <section className="section">
        <div className="section__head">
          <h2>Schuift door</h2>
          <span className="section__note">geen score, alleen duur</span>
        </div>
        <ul className="list">
          {langstlopend.map((e) => (
            <li key={e.id}>
              <div className="row">
                <div className="row__body">
                  <span className="row__title">{e.what}</span>
                  <span className="row__sub">
                    {e.party} · {durationPhrase(e.opened_at)} open · {e.source_label}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Frogs van de afgelopen dagen</h2>
          <span className="section__note">{briefings.length} dagen bewaard</span>
        </div>
        <ul className="list">
          {briefings.map((b) => (
            <li key={b.id}>
              <div className="row">
                <div className="row__body">
                  <span className={`row__title${b.frog_status === "done" ? " row__title--done" : ""}`}>
                    {b.frog_title}
                  </span>
                  <span className="row__sub">
                    {b.frog_status === "done"
                      ? "gedaan"
                      : b.frog_status === "deferred"
                        ? "verschoven"
                        : "open gebleven"}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
