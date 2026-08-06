import Link from "next/link";
import { currentUserId } from "@/lib/db/client";
import { getBriefingToday } from "@/brain/briefing-engine";
import { getOpenCommitments } from "@/lib/commitments";
import { answerConfirmation, setFrogStatus, togglePriority } from "@/lib/actions";
import { formatDayLong, formatTime } from "@/lib/text";
import { CaptureField } from "@/components/CaptureField";
import { onboardingStatus } from "@/lib/onboarding/status";
import { firstOpenStep, stepPath } from "@/lib/onboarding/steps";
import type { BriefingToday } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Vandaag — de homepage (§6.1).
 *
 * Volgorde is bewust: frog, coachregel, top-3, tijdlijn, nog te bevestigen.
 * Alles wat daarbuiten valt (alle projecten, alle open eindjes, statistiek)
 * hoort hier nadrukkelijk niet.
 *
 * De vier staten uit §9 zijn met ?state= te bekijken. De echte staat is
 * "degraded": in de seed-data is de Ponto-toestemming bijna verlopen, en dat is
 * precies hoe het in productie meestal staat.
 */
export default async function VandaagPage({
  searchParams,
}: {
  searchParams: { state?: string };
}) {
  const userId = await currentUserId();
  const raw = await getBriefingToday(userId);
  const looseEnds = await getOpenCommitments(userId);
  const briefing = applyPreview(raw, searchParams.state);
  const onboarding = await onboardingStatus(userId);
  const openStap = onboarding.finishedAt ? null : firstOpenStep(onboarding.steps);

  return (
    <>
      <p className="eyebrow">{formatDayLong(new Date())}</p>

      <h1 className="day-title">Goedemorgen.</h1>
      <p className="lede day-title__lede">Begin klein; kies wat vandaag echt verschil maakt.</p>

      {/* Wie de poort voorbij is maar de reeks niet uitliep, ziet hier één
          regel — geen tweede onboarding, alleen de weg terug. Hij verdwijnt
          zodra je op "Naar vandaag" hebt gedrukt, ook als je stappen oversloeg:
          overslaan is een antwoord, geen uitstel. */}
      {openStap && (
        <div className="notice" style={{ marginTop: "var(--s-4)" }}>
          <span className="notice__mark">Onaf</span>
          <span>
            Je bent de bronnen nog niet langsgelopen.{" "}
            <Link href={stepPath(openStap)} className="btn--text">
              Afmaken
            </Link>
          </span>
        </div>
      )}

      {briefing.state === "empty" ? (
        <EmptyDay />
      ) : (
        <>
          {briefing.degraded.length > 0 && (
            <div className="notice notice--signal" style={{ marginTop: "var(--s-4)" }}>
              <span className="notice__mark">Incompleet</span>
              <span>
                {briefing.degraded.map((d) => d.message).join(" ")}{" "}
                <Link href="/instellingen" className="btn--text">
                  Herstellen
                </Link>
              </span>
            </div>
          )}

          {briefing.frog && (
            <section className={`frog${briefing.frog.status === "done" ? " frog--done" : ""}`}>
              <p className="frog__label">Vandaag één ding</p>
              <p className="frog__title">{briefing.frog.title}</p>
              {briefing.frog.sub && <p className="frog__sub">{briefing.frog.sub}</p>}
              {briefing.frog.implement && (
                <p className="frog__implement">{briefing.frog.implement}</p>
              )}

              <div className="frog__actions">
                {briefing.frog.status === "done" ? (
                  <>
                    <span className="chip chip--accent">Gedaan</span>
                    <form action={setFrogStatus.bind(null, "open")}>
                      <button className="btn btn--text" type="submit">
                        Toch weer openzetten
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <form action={setFrogStatus.bind(null, "done")}>
                      <button className="btn btn--primary" type="submit">
                        Afvinken
                      </button>
                    </form>
                    <form action={setFrogStatus.bind(null, "deferred")}>
                      <button className="btn btn--text" type="submit">
                        Lukt niet vandaag
                      </button>
                    </form>
                  </>
                )}
              </div>
            </section>
          )}

          {briefing.coach_text && <p className="coach">{briefing.coach_text}</p>}

          {briefing.state === "clear" && (
            <div className="rest">
              <h2>Alles is afgehandeld.</h2>
              <p>
                Niets meer te bevestigen, geen open prioriteiten. De rest van de dag is van
                jou — niet van de lijst.
              </p>
            </div>
          )}

          <section className="section">
            <div className="section__head">
              <h2>Prioriteiten</h2>
              <span className="section__note">maximaal drie, ook als er meer zijn</span>
            </div>
            <ul className="list">
              {briefing.priorities.map((p) => (
                <li key={p.id}>
                  {/* Eén doelwit: de hele regel is de knop. Op 390px is een los
                      vinkvakje van 20px te klein om betrouwbaar te raken. */}
                  <form action={togglePriority.bind(null, p.id)}>
                    <button type="submit" className="row row--button">
                      <span className="check" data-checked={p.done} aria-hidden="true" />
                      <span className="row__body">
                        <span className={`row__title${p.done ? " row__title--done" : ""}`}>
                          {p.text}
                        </span>
                      </span>
                      <span className="sr-only">
                        {p.done ? "Terugzetten" : "Afvinken"}
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>

          <section className="section">
            <div className="section__head">
              <h2>Vandaag in de agenda</h2>
              <span className="section__note">{briefing.timeline.length} blokken</span>
            </div>
            <ul className="timeline">
              {briefing.timeline.map((e) => (
                <li key={e.id}>
                  <time dateTime={e.start}>
                    {formatTime(e.start)}–{formatTime(e.end)}
                  </time>
                  <div>
                    <span className="timeline__title">{e.title}</span>
                    {e.conflict_with && (
                      <div className="timeline__conflict">
                        {e.conflict_with.startsWith("er staat")
                          ? e.conflict_with
                          : `tegelijk met ${e.conflict_with}`}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {briefing.confirmations.some((c) => !c.answered) && (
            <section className="section">
              <div className="section__head">
                <h2>Nog te bevestigen</h2>
                <span className="section__note">uit gisteren</span>
              </div>
              <ul className="list">
                {briefing.confirmations
                  .filter((c) => !c.answered)
                  .map((c) => (
                    <li key={c.id}>
                      <div className="row">
                        <div className="row__body">
                          <span className="row__title">{c.text}</span>
                          <div className="row__actions">
                            <form action={answerConfirmation.bind(null, c.id, "yes")}>
                              <button
                                className="btn btn--quiet"
                                type="submit"
                                aria-label={`Ja: ${c.text}`}
                              >
                                Ja
                              </button>
                            </form>
                            <form action={answerConfirmation.bind(null, c.id, "no")}>
                              <button
                                className="btn btn--quiet"
                                type="submit"
                                aria-label={`Nee: ${c.text}`}
                              >
                                Nee
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section className="section">
            <div className="section__head">
              <h2>Open eindjes</h2>
              <Link href="/open-eindjes" className="section__note">
                alle {looseEnds.total} bekijken
              </Link>
            </div>
            <p className="muted" style={{ fontSize: "var(--t-sm)" }}>
              {looseEnds.i_owe.length} keer wacht iemand op jou, {looseEnds.they_owe.length}{" "}
              keer wacht jij op iemand.
            </p>
          </section>

          <CaptureField />
        </>
      )}

      <StateSwitch current={briefing.state} />
    </>
  );
}

function EmptyDay() {
  return (
    <>
      <section className="frog">
        <p className="frog__label">Dag 1</p>
        <h1 className="frog__title">Nog geen briefing — ik ken je dag nog niet.</h1>
        <p className="frog__sub">
          Koppel een agenda en je mail, dan stel ik morgenochtend zelf een frog voor uit wat
          ik vind. Bevestigen mag je doen.
        </p>
        <div className="frog__actions">
          <Link className="btn btn--primary" href="/onboarding">
            Accounts koppelen
          </Link>
        </div>
      </section>
      <div className="empty" style={{ marginTop: "var(--s-6)" }}>
        <strong>Wat er straks staat</strong>
        Eén taak groot bovenaan, een paar regels over wat opvalt, maximaal drie prioriteiten
        en je agenda van vandaag. Meer niet.
      </div>
    </>
  );
}

function StateSwitch({ current }: { current: BriefingToday["state"] }) {
  const states: Array<[BriefingToday["state"], string]> = [
    ["normal", "Normaal"],
    ["degraded", "Bron ontbreekt"],
    ["empty", "Dag 1"],
    ["clear", "Alles af"],
  ];
  return (
    <div className="state-switch">
      <span className="meta">Staten (§9):</span>
      {states.map(([key, label]) => (
        <Link key={key} href={`/?state=${key}`} aria-current={current === key}>
          {label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Alleen voor de vier-staten-demo: dit verzint geen data, het toont dezelfde
 * briefing zoals hij eruitziet als een bron wegvalt of als alles af is.
 */
function applyPreview(b: BriefingToday, state?: string): BriefingToday {
  if (state === "empty") return { ...b, state: "empty" };
  if (state === "normal") return { ...b, degraded: [], state: "normal" };
  if (state === "clear") {
    return {
      ...b,
      degraded: [],
      frog: b.frog ? { ...b.frog, status: "done" } : null,
      priorities: b.priorities.map((p) => ({ ...p, done: true })),
      confirmations: b.confirmations.map((c) => ({ ...c, answered: true })),
      state: "clear",
    };
  }
  if (state === "degraded") return { ...b, state: "degraded" };
  return b;
}
