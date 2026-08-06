import Link from "next/link";
import { notFound } from "next/navigation";
import { Bank, BellRinging, CalendarBlank, CheckCircle, EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import { currentUserId } from "@/lib/db/client";
import { connectGoogle, continueOnboarding } from "@/lib/actions";
import { authUrlFor } from "@/connectors";
import { onboardingStatus, type Payoff } from "@/lib/onboarding/status";
import { isStepId, mostRestrictive, stepDefinition, type StepId } from "@/lib/onboarding/steps";
import { formatAmount, formatDayLong, formatTime } from "@/lib/text";
import { PERMISSION_LABELS, type Permission } from "@/lib/types";
import { Trail } from "../Trail";
import "../onboarding.css";

export const dynamic = "force-dynamic";

/**
 * Eén stap van de onboarding (§6.3) — één bron per scherm.
 *
 * De opbouw is elke keer dezelfde en dat is het punt: koppelen, meteen zien
 * wat ik in die bron vind, en dán pas de vraag wat ik ermee mag. Die laatste
 * vraag stond eerder als losse stap achteraan; daar gaat hij over niets, want
 * je hebt nog nooit gezien wat de app met je mail dóét. Hier komt hij op het
 * moment dat je net het bewijs voor je hebt.
 *
 * Alles wat je hier leest komt uit de database. Staat er niets, dan zegt het
 * scherm dat — het vorige onboardingscherm had de payoff-zinnen hardgecodeerd
 * en beweerde dus ook bij een lege agenda dat het "drie vaste blokken" zag.
 */

/**
 * Presentatie-laag over de stapdefinities (referentie 3–6.png): overline +
 * serif-vraagtitel. De functionele titels uit steps.ts blijven de waarheid in
 * het spoor en op het klaar-scherm; hier stelt de kop de vraag waar de stap
 * over gaat. "Waar komt je werk binnen?" en "Wanneer mag ik even aankloppen?"
 * komen letterlijk uit de referentie; agenda en bank hebben daar geen eigen
 * scherm en volgen hetzelfde patroon.
 */
const OVERLINE: Record<StepId, string> = {
  agenda: "Jouw agenda",
  mail: "Jouw bronnen",
  bank: "Jouw bank",
  meldingen: "Jouw momenten",
};

const QUESTION: Record<StepId, string> = {
  agenda: "Hoe ziet je dag eruit?",
  mail: "Waar komt je werk binnen?",
  bank: "Wat komt er binnen?",
  meldingen: "Wanneer mag ik even aankloppen?",
};

/** Dun lijnwerk-icoon per stap, links op de bronkaarten (zie 4.png/5.png). */
const STEP_ICON: Record<StepId, typeof CalendarBlank> = {
  agenda: CalendarBlank,
  mail: EnvelopeSimple,
  bank: Bank,
  meldingen: BellRinging,
};

const LEDE: Record<StepId, string> = {
  agenda:
    "Zonder agenda weet ik niet hoe je dag eruitziet. Dit is de bron waar de rest op leunt.",
  mail: "Uit je mail haal ik wie op jou wacht en waar jij op wacht. Ik lees mee, ik verstuur niets.",
  bank: "Alleen lezen. Ik categoriseer wat er binnenkomt en zie je vaste lasten — ik doe nooit iets bij je bank.",
  meldingen:
    "Zet Wingman op je beginscherm, dan krijg je het ochtendmoment als melding. Anders komt het per mail.",
};

/**
 * De permissiegradiënt (§6.7) in de taal van de bron waar hij over gaat. Vier
 * keer "voorstellen · concept maken · doen en melden · stil doen" naast elkaar
 * zegt niets; wat het per bron betékent wel.
 */
const PERMISSION_HELP: Partial<Record<StepId, Record<Permission, string>>> = {
  agenda: {
    propose: "Ik stel voor, jij klikt. Er verschuift niets zonder je ja.",
    draft: "Ik zet een afspraak klaar als concept; jij bevestigt.",
    act_and_report: "Ik plan zelf en vertel achteraf wat ik deed.",
    silent: "Ik plan zelf en meld het niet apart.",
  },
  mail: {
    propose: "Ik stel een antwoord voor, jij beslist.",
    draft: "Ik zet het concept klaar in Gmail. Versturen doe jij.",
    act_and_report: "Ik zet concepten meteen klaar en meld dat.",
    silent: "Ik zet concepten klaar zonder er iets over te zeggen.",
  },
};

export default async function OnboardingStepPage({ params }: { params: { stap: string } }) {
  if (!isStepId(params.stap)) notFound();
  const step = params.stap;
  const definition = stepDefinition(step);

  const userId = await currentUserId();
  const { steps, connectors, payoff } = await onboardingStatus(userId, step);
  const state = steps.find((s) => s.id === step)!;

  const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const pontoUrl = authUrlFor("ponto");
  const permission = mostRestrictive(connectors.map((c) => c.permission));

  const StepIcon = STEP_ICON[step];

  return (
    <div className="ob-step">
      <Trail steps={steps} current={step} />

      <p className="eyebrow wizard__eyebrow">
        {OVERLINE[step]}
      </p>
      <h1 className="screen-title">{QUESTION[step]}</h1>
      <p className="lede screen-lede">{LEDE[step]}</p>

      {state.status === "connected" ? (
        <>
        <PayoffBlock payoff={payoff} connected />

          <ul className="ob-cards">
            {connectors.map((c) => (
              <li key={c.id} className="ob-card">
                <StepIcon className="ob-card__icon" aria-hidden="true" />
                <div className="ob-card__body">
                  <span className="ob-card__title">{c.label}</span>
                  <span className="ob-card__sub">
                    {c.status === "active" ? "Gekoppeld" : "Gekoppeld, maar hapert"}
                  </span>
                </div>
                <span className="ob-card__state" aria-hidden="true">
                  <CheckCircle weight="regular" />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ConnectBlock
          step={step}
          googleConfigured={googleConfigured}
          pontoUrl={pontoUrl}
          payoff={payoff}
        />
      )}

      <form action={continueOnboarding.bind(null, step)} className="wizard__form">
        {definition.asksPermission && state.status === "connected" && (
          <fieldset className="choices">
            <legend className="eyebrow">Wat mag ik hiermee?</legend>
            {/* Eén antwoord voor de hele stap, dus zeg waar het over gaat. Bij
                twee agenda's zou een naamloze vraag stilzwijgend ook de
                privéagenda meenemen. */}
            {connectors.length > 1 && (
              <p className="meta" style={{ marginBottom: "var(--s-3)" }}>
                Geldt voor {connectors.map((c) => c.label).join(" en ")}. Los instellen kan bij
                Instellingen.
              </p>
            )}
            {(Object.keys(PERMISSION_LABELS) as Permission[]).map((value) => (
              <label key={value} className="choice">
                <input
                  type="radio"
                  name="permission"
                  value={value}
                  defaultChecked={value === permission}
                />
                <span>
                  <span className="choice__title">{PERMISSION_LABELS[value]}</span>
                  <span className="choice__help">{PERMISSION_HELP[step]?.[value]}</span>
                </span>
              </label>
            ))}
            {step === "mail" && (
              <p className="meta" style={{ marginTop: "var(--s-3)" }}>
                Wat je hier ook kiest: Wingman verstuurt in deze versie geen mail. Concepten wel,
                versturen nooit.
              </p>
            )}
          </fieldset>
        )}

        {/* Wat je hier kunt, hangt af van waar de stap staat. "Volgende" op een
            bron die niet gekoppeld is zou een knop zijn die doet alsof er iets
            gebeurd is; overslaan is dan het eerlijke woord. */}
        <div className="btn-row wizard__actions">
          {step === "meldingen" ? (
            <>
              <button className="btn btn--primary" type="submit" name="markeer" value="done">
                Hij staat erop
              </button>
              <button className="btn btn--text" type="submit" name="markeer" value="skipped">
                Later
              </button>
            </>
          ) : state.status === "connected" ? (
            <button className="btn btn--primary" type="submit" name="markeer" value="">
              Ga verder
            </button>
          ) : (
            <button className="btn btn--text" type="submit" name="markeer" value="skipped">
              Overslaan
            </button>
          )}
        </div>
      </form>

      {state.status === "skipped" && (
        <p className="meta">
          Deze stap sloeg je eerder over. Koppelen kan altijd nog via{" "}
          <Link className="btn--text" href="/instellingen">
            Instellingen
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/**
 * De koppelknop. Elke bron heeft zijn eigen weg naar buiten en die zijn niet
 * uitwisselbaar: Google loopt via de NextAuth-provider (agenda én mail in één
 * consentscherm), Ponto via Nango. Staat een van beide niet aan in deze
 * omgeving, dan zegt het scherm dat — een knop die achter de schermen 501
 * teruggeeft is erger dan geen knop.
 */
function ConnectBlock({
  step,
  googleConfigured,
  pontoUrl,
  payoff,
}: {
  step: StepId;
  googleConfigured: boolean;
  pontoUrl: string | null;
  payoff: Payoff;
}) {
  if (step === "meldingen") {
    return (
      <div className="empty" style={{ marginTop: "var(--s-5)" }}>
        <strong>Zo zet je hem op je beginscherm</strong>
        Op de iPhone: deel-knop onderin, dan &ldquo;Zet op beginscherm&rdquo;. Op Android: menu
        rechtsboven, dan &ldquo;App installeren&rdquo;. Daarna komt het ochtendmoment als melding
        binnen in plaats van per mail.
      </div>
    );
  }

  if (step === "bank") {
    return (
      <>
        {pontoUrl ? (
          <div className="btn-row" style={{ marginTop: "var(--s-5)" }}>
            <Link className="btn btn--quiet" href="/api/v1/connect/ponto">
              Bank koppelen via Ponto
            </Link>
          </div>
        ) : (
          <div className="notice" style={{ marginTop: "var(--s-5)" }}>
            <span className="notice__mark">Nog niet</span>
            <span>
              De bankkoppeling staat in deze omgeving nog niet aan. Sla hem over — je kunt hem
              later alsnog leggen.
            </span>
          </div>
        )}
        <p className="meta" style={{ marginTop: "var(--s-3)" }}>
          Eén flow voor alle Europese banken. De toestemming verloopt na 90 dagen; dat zie je
          terug bij Instellingen.
        </p>
        <PayoffBlock payoff={payoff} connected={false} />
      </>
    );
  }

  // Agenda en mail komen allebei uit dezelfde Google-autorisatie.
  return (
    <>
      {googleConfigured ? (
        <form action={connectGoogle.bind(null, step)} className="btn-row wizard__connect">
          <button className="btn btn--primary" type="submit">
            {step === "agenda" ? "Agenda koppelen met Google" : "Mail koppelen met Google"}
          </button>
        </form>
      ) : (
        <div className="notice" style={{ marginTop: "var(--s-5)" }}>
          <span className="notice__mark">Nog niet</span>
          <span>
            Inloggen met Google staat in deze omgeving nog niet aan, dus kan ik deze bron nog
            niet koppelen.
          </span>
        </div>
      )}
      <p className="meta" style={{ marginTop: "var(--s-3)" }}>
        {step === "agenda"
          ? "Agenda en mail zitten in hetzelfde Google-consentscherm — je komt hier maar één keer langs. Apple of een andere agenda kan nog niet."
          : "Alleen lezen en concepten klaarzetten. IMAP en Outlook kunnen nog niet."}
      </p>
    </>
  );
}

/**
 * Wat ik in deze bron vind, in gewone taal. Er is nog geen sync die agenda en
 * mail binnenhaalt, dus staat er voorlopig vaak nog niets — en dan zegt het
 * scherm wat de volgende stap is in plaats van iets te verzinnen. Is de bron
 * al gekoppeld maar nog leeg, dan hoort daar een andere zin bij dan "koppel
 * nu": dat commando heeft de gebruiker net uitgevoerd.
 */
function PayoffBlock({ payoff, connected }: { payoff: Payoff; connected: boolean }) {
  const text = payoffText(payoff, connected);
  if (!text) return null;
  return (
    <p className="step__payoff" style={{ marginTop: "var(--s-5)" }}>
      {text}
    </p>
  );
}

/**
 * Wat er staat als er nog niets te melden is.
 *
 * Eerder stond hier een uitleg waarom het scherm leeg was ("ik heb er nog
 * niets uit gelezen, dat doe ik bij het eerstvolgende ochtendmoment"). Klopt,
 * maar het is een excuus op de plek waar de gebruiker vooruit wil: hij hoort
 * te lezen wat hij nú kan doen, niet waarom er niets staat.
 */
const NOG_NIETS = "Start met koppelen van je accounts.";
const NOG_NIETS_GEKOPPELD = "Zodra ik er iets in zie, zeg ik het hier.";

function payoffText(payoff: Payoff, connected: boolean): string | null {
  if (payoff.kind === "agenda") {
    if (payoff.events === 0 && !payoff.next)
      return connected ? `Je agenda is gekoppeld. ${NOG_NIETS_GEKOPPELD}` : NOG_NIETS;
    const eerste = payoff.next
      ? ` De eerstvolgende is ${payoff.next.title}, ${formatDayLong(payoff.next.start_at)} om ${formatTime(payoff.next.start_at)}.`
      : "";
    return `Ik zie ${telwoord(payoff.events, "afspraak", "afspraken")} in de komende zeven dagen.${eerste}`;
  }

  if (payoff.kind === "mail") {
    if (payoff.people === 0 && payoff.open === 0)
      return connected ? `Je mail is gekoppeld. ${NOG_NIETS_GEKOPPELD}` : NOG_NIETS;
    return `Ik ken ${telwoord(payoff.people, "persoon", "mensen")} uit je mail en zie ${telwoord(payoff.open, "open eindje", "open eindjes")}.`;
  }

  if (payoff.kind === "bank") {
    if (payoff.transactions === 0) return null;
    const twijfel =
      payoff.needsReview > 0
        ? ` Bij ${telwoord(payoff.needsReview, "transactie", "transacties")} weet ik de categorie niet.`
        : "";
    return `Ik zie ${telwoord(payoff.transactions, "transactie", "transacties")}, waarvan ${formatAmount(payoff.incoming)} binnenkwam in de afgelopen week.${twijfel}`;
  }

  return null;
}

/** "1 afspraak" en "3 afspraken" — een kale "1 afspraken" leest als een bug. */
function telwoord(n: number, enkel: string, meer: string): string {
  return `${n} ${n === 1 ? enkel : meer}`;
}
