import Link from "next/link";
import { currentUserId, withUser } from "@/lib/db/client";
import { finishOnboarding } from "@/lib/actions";
import { onboardingStatus } from "@/lib/onboarding/status";
import { stepDefinition, stepPath } from "@/lib/onboarding/steps";
import { DOMAIN_REGISTRY, LEVEL_LABELS } from "@/lib/mandates/domains";
import { Check } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

/**
 * Het slot van de onboarding.
 *
 * Dit scherm bestond niet, en dat was het grootste gat: na de laatste koppeling
 * viel je in een leeg dashboard zonder te weten of er iets ging gebeuren. Wat
 * hier staat is daarom precies één ding — wanneer je het eerste resultaat
 * ziet, en wat er nog open ligt als je stappen oversloeg.
 *
 * Geen felicitatie, geen confetti: er is nog niets bereikt, er is iets
 * ingesteld.
 */
export default async function OnboardingKlaarPage() {
  const userId = await currentUserId();
  const { steps, mandates, quietHours } = await onboardingStatus(userId);

  const morning = await withUser(userId, (tx) =>
    tx.scheduledRun.findFirst({
      where: { user_id: userId, kind: "morning" },
      select: { at: true, enabled: true },
    }),
  );

  const gekoppeld = steps.filter((s) => s.status === "connected");
  const overgeslagen = steps.filter((s) => s.status === "skipped");

  // Alleen de domeinen van stappen die je echt koppelde — een overgeslagen
  // bron heeft nooit om een mandaat gevraagd, dus hoort hier ook niet in te
  // staan. Generiek over DOMAIN_REGISTRY: een nieuw domein op een nieuwe stap
  // verschijnt hier vanzelf, zonder dat dit bestand hoeft te weten welke
  // domeinen er zijn.
  const mandaatDomeinen = Array.from(
    new Set(gekoppeld.flatMap((s) => stepDefinition(s.id).domains)),
  );
  const mandaatRegels = mandaatDomeinen.map((domain) => ({
    domain,
    level: mandates.find((m) => m.domain === domain)?.level ?? 1,
  }));

  return (
    <>
      <section className="onboarding-complete">
      <span className="state-orb state-orb--done" aria-hidden="true"><Check weight="bold" /></span>
      <p className="eyebrow">Alles op z’n plek</p>
      <h1 className="screen-title">
        {gekoppeld.length === 0
          ? "Ik heb nog geen bron — dan blijft Vandaag voorlopig leeg."
          : "Dit is wat ik nu mag lezen."}
      </h1>

      {gekoppeld.length > 0 && (
        <p className="lede" style={{ marginTop: "var(--s-3)" }}>
          {gekoppeld.map((s) => s.short.toLowerCase()).join(", ")} — meer heb ik niet nodig om te
          beginnen.
        </p>
      )}

      {mandaatRegels.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2>Wat mag Wingman hiermee?</h2>
          </div>
          <ul className="list">
            {mandaatRegels.map(({ domain, level }) => (
              <li key={domain}>
                <div className="row">
                  <div className="row__body">
                    <span className="row__title">{DOMAIN_REGISTRY[domain].label}</span>
                    <span className="row__sub">{LEVEL_LABELS[level]}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="empty" style={{ marginTop: "var(--s-5)" }}>
        <strong>Wat er nu gebeurt</strong>
        {morning?.enabled
          ? `Om ${morning.at} lees ik je bronnen en zet ik één taak, maximaal drie prioriteiten en je agenda klaar. Bevestigen mag je doen.`
          : "Het ochtendmoment staat uit. Zet het aan bij Instellingen, anders wacht ik tot je zelf langskomt."}
        {quietHours ? ` Tussen ${quietHours.replace("-", " en ")} stuur ik niets.` : ""}
      </div>

      {overgeslagen.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2>Nog open</h2>
            <span className="section__note">sloeg je over, kan altijd nog</span>
          </div>
          <ul className="list">
            {overgeslagen.map((s) => (
              <li key={s.id}>
                <div className="row">
                  <div className="row__body">
                    <Link className="row__title" href={stepPath(s.id)}>
                      {s.title}
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Referentie 7.png: de afsluitknop is baanbreed. */}
      <form action={finishOnboarding} style={{ marginTop: "var(--s-6)" }}>
        <button className="btn btn--primary" type="submit" style={{ width: "100%" }}>
          Naar vandaag
        </button>
      </form>

      <p className="meta" style={{ marginTop: "var(--s-4)" }}>
        Wat ik met elke bron mag, pas je later aan bij{" "}
        <Link className="btn--text" href="/instellingen">
          Instellingen
        </Link>
        .
      </p>
      </section>
    </>
  );
}
