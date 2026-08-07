import Link from "next/link";
import "./vandaag.css";
import { currentUserId, prisma } from "@/lib/db/client";
import { getBriefingToday } from "@/brain/briefing-engine";
import { getOpenCommitments } from "@/lib/commitments";
import { answerConfirmation, setFrogStatus, togglePriority } from "@/lib/actions";
import { formatDayLong, formatTime } from "@/lib/text";
import { CaptureField } from "@/components/CaptureField";
import {
  ArrowsClockwise,
  Checks,
  CloudSlash,
  ListChecks,
  Moon,
  Sun,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { onboardingStatus } from "@/lib/onboarding/status";
import { firstOpenStep, stepPath } from "@/lib/onboarding/steps";
import type { BriefingToday } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Vandaag — de homepage (§6.1), visueel naar design-reference/screens/8–11.png.
 *
 * Volgorde is bewust: datum-overline, serif-begroeting, één subregel, frog,
 * drie prioriteiten als checkboxrijen, agenda. Alles wat daarbuiten valt
 * (alle projecten, alle open eindjes, statistiek) hoort hier nadrukkelijk niet.
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const voornaam = user?.name?.trim().split(/\s+/)[0];
  const isDev = process.env.NODE_ENV !== "production";

  if (briefing.state === "clear") {
    return (
      <>
        <EveningDone briefing={briefing} />
        {isDev && <StateSwitch current={briefing.state} />}
      </>
    );
  }

  if (briefing.state === "empty") {
    return (
      <>
        {openStap && <OnboardingNotice stap={openStap} />}
        <FirstMorning />
        {isDev && <StateSwitch current={briefing.state} />}
      </>
    );
  }

  if (briefing.state === "degraded") {
    return (
      <>
        <p className="eyebrow">{formatDayLong(new Date())}</p>
        <h1 className="vd-greeting">Vandaag, zonder volle context.</h1>

        {openStap && <OnboardingNotice stap={openStap} />}

        {briefing.degraded.map((d) => (
          <div className="vd-alert" key={d.connector}>
            <Warning weight="regular" />
            <span>
              <strong>Bron tijdelijk niet bereikbaar.</strong> {d.message} We laten
              alleen zien wat er zeker is.
            </span>
          </div>
        ))}

        {briefing.timeline.length === 0 ? (
          <div className="vd-empty-card">
            <CloudSlash weight="light" />
            <h2>Geen afspraken gevonden</h2>
            <p>Probeer straks opnieuw of werk vanuit je eigen richting.</p>
          </div>
        ) : (
          <Agenda timeline={briefing.timeline} />
        )}

        {briefing.frog && (
          <section className="frog" style={{ marginTop: "var(--s-5)" }}>
            <p className="frog__label">Wat wel overeind blijft</p>
            <p className="frog__title">{briefing.frog.title}</p>
            {briefing.frog.sub && <p className="frog__sub">{briefing.frog.sub}</p>}
          </section>
        )}

        <Link href="/instellingen" className="btn btn--quiet vd-wide-btn">
          <ArrowsClockwise weight="bold" />
          Opnieuw verbinden
        </Link>

        {isDev && <StateSwitch current={briefing.state} />}
      </>
    );
  }

  const eersteAfspraak = briefing.timeline.find((e) => new Date(e.start) > new Date());

  return (
    <>
      <p className="eyebrow">{formatDayLong(new Date())}</p>

      <h1 className="vd-greeting">
        {dagdeelGroet()}
        {voornaam ? `, ${voornaam}` : ""}.
      </h1>
      <p className="lede vd-lede">
        {eersteAfspraak
          ? `Je hebt ruimte tot ${formatTime(eersteAfspraak.start)}. Begin klein, maar echt.`
          : "Begin klein; kies wat vandaag echt verschil maakt."}
      </p>

      {/* Wie de poort voorbij is maar de reeks niet uitliep, ziet hier één
          regel — geen tweede onboarding, alleen de weg terug. Hij verdwijnt
          zodra je op "Naar vandaag" hebt gedrukt, ook als je stappen oversloeg:
          overslaan is een antwoord, geen uitstel. */}
      {openStap && <OnboardingNotice stap={openStap} />}

      {briefing.frog && (
        <section className={`frog${briefing.frog.status === "done" ? " frog--done" : ""}`}>
          <p className="frog__label">Je frog</p>
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

      {/* Prioriteiten en stand staan naast elkaar zodra er breedte is. Op een
          telefoon onder elkaar, prioriteiten eerst: die vragen een handeling,
          de stand is alleen om te weten. */}
      <div className="vd-split">
        <section className="vd-section">
          <h2>Jouw 3 prioriteiten</h2>
          <ul className="vd-prios">
            {briefing.priorities.map((p, i) => (
              <li key={p.id}>
                {/* Eén doelwit: de hele regel is de knop. Op 390px is een los
                    vinkvakje van 20px te klein om betrouwbaar te raken. */}
                <form action={togglePriority.bind(null, p.id)}>
                  <button type="submit" className="vd-prio" data-done={p.done}>
                    <span className="vd-prio__num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="vd-prio__body">
                      <span className="vd-prio__title">{p.text}</span>
                      {p.sub && <span className="vd-prio__sub">{p.sub}</span>}
                    </span>
                    {p.when && <span className="vd-prio__when">{p.when}</span>}
                    <span className="sr-only">{p.done ? "Terugzetten" : "Afvinken"}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <Stand
          afspraken={briefing.timeline.length}
          openEindjes={looseEnds.total}
          teBevestigen={briefing.confirmations.filter((c) => !c.answered).length}
        />
      </div>

      {briefing.coach_text && (
        <section className="vd-coach">
          <p className="vd-coach__label">Wingman ziet</p>
          <p className="coach">{briefing.coach_text}</p>
        </section>
      )}

      <Agenda timeline={briefing.timeline} />

      {briefing.confirmations.some((c) => !c.answered) && (
        <section className="vd-section">
          <h2>Nog te bevestigen</h2>
          <ul className="list">
            {briefing.confirmations
              .filter((c) => !c.answered)
              .map((c) => (
                <li key={c.id}>
                  <div className="row" style={{ paddingInline: 0 }}>
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

      <section className="vd-section">
        <h2>Open eindjes</h2>
        <p className="muted" style={{ fontSize: "var(--t-sm)" }}>
          {looseEnds.i_owe.length} keer wacht iemand op jou, {looseEnds.they_owe.length}{" "}
          keer wacht jij op iemand.{" "}
          <Link href="/open-eindjes" className="btn--text">
            Alle {looseEnds.total} bekijken
          </Link>
        </p>
      </section>

      <section className="vd-section">
        <h2>Iets kwijt?</h2>
        <CaptureField variant="bare" />
      </section>

      {isDev && <StateSwitch current={briefing.state} />}
    </>
  );
}

/**
 * "Zo sta je ervoor" — drie tellingen, verder niets.
 *
 * De verkenning tekent hier gekleurde stippen en "Agenda 58% gevuld". Geen van
 * beide gaat erin: DESIGN.md verbiedt rood en kleurcodering over de UI, en een
 * vullingspercentage is een score — precies wat de anti-slop-lijst uitsluit.
 * Een getal naast een label zegt hetzelfde zonder te oordelen.
 *
 * Alleen tellingen die de briefing echt heeft. Mail en bank staan in de
 * verkenning maar zitten niet in BriefingToday; die verzinnen we niet.
 */
function Stand({
  afspraken,
  openEindjes,
  teBevestigen,
}: {
  afspraken: number;
  openEindjes: number;
  teBevestigen: number;
}) {
  const regels: Array<[string, number]> = [
    ["Afspraken vandaag", afspraken],
    ["Open eindjes", openEindjes],
    ["Nog te bevestigen", teBevestigen],
  ];
  return (
    <section className="vd-section">
      <h2>Zo sta je ervoor</h2>
      <ul className="vd-stand">
        {regels.map(([label, waarde]) => (
          <li key={label}>
            <span className="vd-stand__label">{label}</span>
            <span className="vd-stand__waarde">{waarde}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Agenda als tijd + titel-rijen met dunne dividers (8.png). */
function Agenda({ timeline }: { timeline: BriefingToday["timeline"] }) {
  if (timeline.length === 0) return null;
  return (
    <section className="vd-section">
      <h2>Agenda</h2>
      <ul className="vd-agenda">
        {timeline.map((e) => (
          <li key={e.id}>
            <time dateTime={e.start}>{formatTime(e.start)}</time>
            <div>
              <span className="vd-agenda__title">{e.title}</span>
              <span className="vd-agenda__sub">{duur(e.start, e.end)}</span>
              {e.conflict_with && (
                <span className="vd-agenda__conflict">
                  {e.conflict_with.startsWith("er staat")
                    ? e.conflict_with
                    : `tegelijk met ${e.conflict_with}`}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Onboarding-onaf: compact, één zin met klein icoon (stijl van 9.png). */
function OnboardingNotice({ stap }: { stap: Parameters<typeof stepPath>[0] }) {
  return (
    <div className="vd-alert">
      <ListChecks weight="regular" />
      <span>
        <strong>Onboarding onaf.</strong> Je bent de bronnen nog niet langsgelopen.{" "}
        <Link href={stepPath(stap)}>Afmaken</Link>
      </span>
    </div>
  );
}

/** Dag 1 (10.png): feature-icoon met gloed, richtingkaart, capture-invoer. */
function FirstMorning() {
  return (
    <>
      <section className="vd-hero">
        <span className="state-orb" aria-hidden="true">
          <Sun weight="regular" />
        </span>
        <p className="eyebrow">Je eerste ochtend</p>
        <h2>Begin met één ding.</h2>
        <p>Er hoeft nog niets ingehaald. Kies alleen wat vandaag een verschil maakt.</p>
      </section>

      <section className="frog vd-direction">
        <p className="frog__label">Eerste richting</p>
        <p className="frog__title">Wat wil je aan het eind van vandaag voelen?</p>
        <p className="frog__sub">Schrijf het in één korte zin op.</p>
      </section>

      <CaptureField variant="bare" placeholder="Vandaag wil ik…" />
    </>
  );
}

/** Avond / alles af (11.png): groene check met gloed, "Je mag stoppen." */
function EveningDone({ briefing }: { briefing: BriefingToday }) {
  const afgerond = [
    ...(briefing.frog && briefing.frog.status === "done" ? [briefing.frog.title] : []),
    ...briefing.priorities.filter((p) => p.done).map((p) => p.text),
  ];

  return (
    <>
      <section className="vd-hero">
        <span className="state-orb state-orb--done" aria-hidden="true">
          <Checks weight="bold" />
        </span>
        <p className="eyebrow">Voor vandaag genoeg</p>
        <h2>Je mag stoppen.</h2>
        <p>Je belangrijkste dingen hebben aandacht gekregen. Morgen is er weer ruimte.</p>
      </section>

      <div className="card vd-done-card">
        <h2>Vandaag afgerond</h2>
        <p>
          {afgerond.length > 0
            ? afgerond.join(" · ")
            : "Niets meer te bevestigen, geen open prioriteiten."}
        </p>
      </div>

      <Link href="/" className="btn btn--quiet vd-wide-btn">
        <Moon weight="regular" />
        Sluit mijn dag
      </Link>
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

/** "45 min" onder de agendatitel — puur presentatie, uit start/eind gerekend. */
function duur(start: string, end: string): string {
  const min = Math.max(0, Math.round((+new Date(end) - +new Date(start)) / 60000));
  if (min >= 60 && min % 60 === 0) return `${min / 60} uur`;
  if (min >= 60) return `${Math.floor(min / 60)} uur ${min % 60} min`;
  return `${min} min`;
}

/**
 * Alleen voor de vier-staten-demo: dit verzint geen data, het toont dezelfde
 * briefing zoals hij eruitziet als een bron wegvalt of als alles af is.
 * Alleen beschikbaar in dev; in productie wordt de preview genegeerd.
 */
function applyPreview(b: BriefingToday, state?: string): BriefingToday {
  // In productie: negeer de ?state= parameter
  if (process.env.NODE_ENV === "production") {
    return b;
  }

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

/** Serif-begroeting volgt het dagdeel — de PNG toont de ochtend. */
function dagdeelGroet(): string {
  const uur = new Date().getHours();
  if (uur < 6) return "Goedenacht";
  if (uur < 12) return "Goedemorgen";
  if (uur < 18) return "Goedemiddag";
  return "Goedenavond";
}
