import { ClockCounterClockwise, Compass } from "@phosphor-icons/react/dist/ssr";
import { currentUserId, withUser } from "@/lib/db/client";
import { getOpenCommitments } from "@/lib/commitments";
import { durationPhrase } from "@/lib/text";
import "./screen.css";

export const dynamic = "force-dynamic";

const MAANDEN = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

/**
 * Weekoverzicht (§6.5, design-reference/screens/15.png) — patronen, geen
 * cijfers.
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
  const now = new Date();
  const todayIndex = (now.getDay() + 6) % 7;

  // Periode-overline uit echte data: maandag t/m zondag van deze week,
  // "3 — 9 augustus" of over een maandgrens "28 juli — 3 augustus".
  const monday = new Date(now);
  monday.setDate(now.getDate() - todayIndex);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const periode =
    monday.getMonth() === sunday.getMonth()
      ? `${monday.getDate()} — ${sunday.getDate()} ${MAANDEN[sunday.getMonth()]}`
      : `${monday.getDate()} ${MAANDEN[monday.getMonth()]} — ${sunday.getDate()} ${MAANDEN[sunday.getMonth()]}`;

  // Punt in de dagstrip op dagen van déze week met een bewaarde briefing.
  const briefedDays = new Set(
    briefings
      .filter((b) => b.date >= monday && b.date <= sunday)
      .map((b) => (b.date.getDay() + 6) % 7),
  );

  return (
    <>
      <p className="eyebrow">{periode}</p>
      <h1 className="screen-title">Je week in beweging.</h1>
      <p className="lede screen-lede">Geen score. Wel een paar patronen om mee te nemen.</p>

      <div className="wk-days" aria-label="Dagen van deze week">
        {weekdays.map((day, index) => (
          <span
            key={day}
            className="wk-day"
            data-current={index === todayIndex}
            data-marked={briefedDays.has(index)}
          >
            {day}
            <span className="wk-day__dot" aria-hidden="true" />
          </span>
        ))}
      </div>

      <div className="wk-insights">
        <article className="wk-insight">
          <span className="wk-insight__icon" aria-hidden="true">
            <ClockCounterClockwise weight="regular" />
          </span>
          <div className="wk-insight__body">
            <h2>{langstlopend.length > 0 ? "Een ding schuift door" : "Er schuift niets door"}</h2>
            <p>
              {langstlopend.length > 0
                ? `“${langstlopend[0].what}” hangt ${durationPhrase(langstlopend[0].opened_at)}.`
                : "Je open eindjes hebben deze week geen nieuwe laag gekregen."}
            </p>
          </div>
        </article>
        <article className="wk-insight">
          <span className="wk-insight__icon" aria-hidden="true">
            <Compass weight="regular" />
          </span>
          <div className="wk-insight__body">
            <h2>{briefings.length > 0 ? "Je dag kreeg richting" : "Je ritme begint hier"}</h2>
            <p>
              {briefings.length > 0
                ? `${briefings.length} dag${briefings.length === 1 ? "" : "en"} heeft een bewaarde focus.`
                : "Zodra je eerste briefing klaarstaat, zie je hier wat terugkomt."}
            </p>
          </div>
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
