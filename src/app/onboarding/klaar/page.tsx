import Link from "next/link";
import { currentUserId, withUser } from "@/lib/db/client";
import { finishOnboarding } from "@/lib/actions";
import { onboardingStatus } from "@/lib/onboarding/status";
import { stepPath } from "@/lib/onboarding/steps";

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
  const { steps } = await onboardingStatus(userId);

  const morning = await withUser(userId, (tx) =>
    tx.scheduledRun.findFirst({
      where: { user_id: userId, kind: "morning" },
      select: { at: true, enabled: true },
    }),
  );

  const gekoppeld = steps.filter((s) => s.status === "connected");
  const overgeslagen = steps.filter((s) => s.status === "skipped");

  return (
    <>
      <p className="eyebrow">Klaar</p>
      <h1 style={{ fontSize: "var(--t-xl)" }}>
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

      <div className="empty" style={{ marginTop: "var(--s-5)" }}>
        <strong>Wat er nu gebeurt</strong>
        {morning?.enabled
          ? `Om ${morning.at} lees ik je bronnen en zet ik één taak, maximaal drie prioriteiten en je agenda klaar. Bevestigen mag je doen.`
          : "Het ochtendmoment staat uit. Zet het aan bij Instellingen, anders wacht ik tot je zelf langskomt."}
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

      <form action={finishOnboarding} className="btn-row" style={{ marginTop: "var(--s-6)" }}>
        <button className="btn btn--primary" type="submit">
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
    </>
  );
}
