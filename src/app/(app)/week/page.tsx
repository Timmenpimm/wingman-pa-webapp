import { currentUserId, withUser } from "@/lib/db/client";
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
  // getOpenCommitments() wikkelt zichzelf al in withUser() (eigen transactie).
  const [{ i_owe, they_owe }, briefings] = await Promise.all([
    getOpenCommitments(userId),
    withUser(userId, (tx) =>
      tx.dailyBriefing.findMany({
        where: { user_id: userId },
        orderBy: { date: "desc" },
        take: 7,
      }),
    ),
  ]);

  const langstlopend = [...i_owe, ...they_owe]
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at))
    .slice(0, 4);

  const weekdays = ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"];
  const todayIndex = (new Date().getDay() + 6) % 7;

  return (
    <>
      <p className="eyebrow">Deze week</p>
      <h1 className="screen-title">Je week in beweging.</h1>
      <p className="lede screen-lede">Geen score. Wel een paar patronen om mee te nemen.</p>

      <div className="week-days" aria-label="Dagen van deze week">
        {weekdays.map((day, index) => (
          <span key={day} className="week-day" data-current={index === todayIndex}>
            {day}
          </span>
        ))}
      </div>

      <div className="week-insights">
        <article className="week-insight">
          <h2>{langstlopend.length > 0 ? "Een ding schuift door" : "Er schuift niets door"}</h2>
          <p>
            {langstlopend.length > 0
              ? `“${langstlopend[0].what}” hangt ${durationPhrase(langstlopend[0].opened_at)}.`
              : "Je open eindjes hebben deze week geen nieuwe laag gekregen."}
          </p>
        </article>
        <article className="week-insight">
          <h2>{briefings.length > 0 ? "Je dag kreeg richting" : "Je ritme begint hier"}</h2>
          <p>
            {briefings.length > 0
              ? `${briefings.length} dag${briefings.length === 1 ? "" : "en"} heeft een bewaarde focus.`
              : "Zodra je eerste briefing klaarstaat, zie je hier wat terugkomt."}
          </p>
        </article>
      </div>

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
