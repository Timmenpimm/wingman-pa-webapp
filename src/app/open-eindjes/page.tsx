import Link from "next/link";
import { currentUserId } from "@/lib/db/client";
import { withUser } from "@/lib/db/with-user";
import { getOpenCommitments, type LooseEnd } from "@/lib/commitments";
import { resolveCommitment } from "@/lib/actions";
import { durationPhrase } from "@/lib/text";
import { Stapel } from "./Stapel";

export const dynamic = "force-dynamic";

/** Zie Stapel.tsx voor dezelfde constante — bewust hier gedupliceerd in
 *  plaats van een gedeeld bestand, want beide kanten (server-fallback,
 *  client-stapel) mogen zelfstandig blijven werken. */
const SNOOZE_DAYS = 3;

/**
 * Open eindjes (§6.2) — de differentiator.
 *
 * Eén kaart tegelijk in plaats van twee kolommen met lijsten (ontwerp:
 * design-reference/Wingman-v2.dc.html, secties LOOSE/looseHeading/advance).
 * "Ik moet iets" en "ik wacht op iemand" blijven het onderliggende verschil —
 * die twee vragen een ander soort actie — maar tonen nu als kop die meewisselt
 * per kaart in plaats van als aparte lijst.
 */
export default async function OpenEindjesPage() {
  const userId = await currentUserId();
  // Twee losse queries binnen één RLS-transactie: buiten withUser() staat
  // app.user_id niet en geeft de database geen enkele rij terug.
  const [{ i_owe, they_owe, total }, { connectors, everHad }] = await Promise.all([
    getOpenCommitments(userId),
    withUser(userId, async (tx) => ({
      connectors: await tx.connector.findMany({ where: { user_id: userId } }),
      everHad: await tx.commitment.count({ where: { user_id: userId } }),
    })),
  ]);

  // Dezelfde vier staten als Vandaag (§9), ongewijzigde bepaling. Het verschil
  // tussen "dag 1" en "alles afgehandeld" is essentieel: een leeg scherm
  // betekent iets heel anders als je net gekoppeld hebt dan wanneer je net
  // hebt opgeruimd.
  const degraded = connectors.filter(
    (c) => c.status === "error" || c.status === "reauth_required",
  );
  const state: "empty" | "degraded" | "clear" | "normal" =
    everHad === 0 ? "empty" : total === 0 ? "clear" : degraded.length > 0 ? "degraded" : "normal";

  // Eén stapel, oudste eerst — ongeacht richting. De kop op de kaart zelf
  // maakt het onderscheid tussen "ik moet iets" en "ik wacht op iemand".
  const items: LooseEnd[] = [...i_owe, ...they_owe].sort((a, b) =>
    a.opened_at.localeCompare(b.opened_at),
  );
  const oldest = items[0]?.opened_at ?? null;

  return (
    <>
      <p className="eyebrow">Losse draden over alle bronnen heen</p>
      <h1 style={{ fontSize: "var(--t-xl)" }}>Open eindjes</h1>

      {state === "empty" ? (
        <div className="empty" style={{ marginTop: "var(--s-5)" }}>
          <strong>Nog niets gevonden.</strong>
          Ik lees mail, agenda en chat pas sinds vandaag. Zodra iemand op je wacht — of jij
          op iemand — staat het hier. <Link href="/onboarding">Meer bronnen koppelen</Link>
        </div>
      ) : state === "clear" ? (
        <div className="rest" style={{ marginTop: "var(--s-5)" }}>
          <h2>Geen losse draden.</h2>
          <p>
            Niemand wacht op jou, jij wacht op niemand. Dit blok hoort leeg te kunnen zijn —
            en dat is het nu.
          </p>
        </div>
      ) : (
        // Bij één kaart tegelijk zegt de teller "1 van 6" hetzelfde als deze
        // regel, en de kaart zelf toont de leeftijd. Twee keer hetzelfde kost
        // hier de ruimte die de drie actieknoppen nodig hebben om zonder
        // scrollen in beeld te staan — dat is het scherm belangrijker.
        <p className="meta" style={{ marginTop: "var(--s-2)" }}>
          De oudste hangt {durationPhrase(oldest!)}.
        </p>
      )}

      {degraded.length > 0 && (
        <div className="notice notice--signal" style={{ marginTop: "var(--s-4)" }}>
          <span className="notice__mark">Incompleet</span>
          <span>
            {degraded
              .map((c) => c.error_message ?? `${c.label} was niet bereikbaar.`)
              .join(" ")}{" "}
            Er kunnen dus draden ontbreken.{" "}
            <Link href="/instellingen" className="btn--text">
              Herstellen
            </Link>
          </span>
        </div>
      )}

      {(state === "normal" || state === "degraded") && (
        <>
          {/* Werkt alleen met JS: de client-stapel gebruikt useTransition om
              resolveCommitment aan te roepen en animeert per kaart. */}
          <Stapel items={items} />

          {/* Zonder JS bestaat de client-stapel wel als HTML, maar de knoppen
              hebben geen werkende handler. <noscript> wordt door de browser
              alleen geparsed als scripting uit staat — dan verbergt deze
              style-regel de stapel en komt de gewone lijst met formulieren
              (die zonder JS al werkt via server actions) in beeld. */}
          <noscript>
            <style>{".loose-stack{display:none}"}</style>
            <FallbackList i_owe={i_owe} they_owe={they_owe} />
          </noscript>
        </>
      )}
    </>
  );
}

/**
 * Val-terug-lijst zonder client-JS: hetzelfde gedrag als vóór de kaart-stapel
 * (twee groepen, server actions in gewone formulieren), met bijgewerkte
 * knoplabels zodat "Later" en het wisselende eerste label overeenkomen met
 * de kaart-versie.
 */
function FallbackList({ i_owe, they_owe }: { i_owe: LooseEnd[]; they_owe: LooseEnd[] }) {
  return (
    <div className="split split--2" style={{ marginTop: "var(--s-5)" }}>
      <FallbackGroup
        title="Ik moet iets"
        note="belofte gedaan, niet ingelost"
        items={i_owe}
        empty="Niemand wacht op jou."
        doneLabel="Afgehandeld"
      />
      <FallbackGroup
        title="Ik wacht op iemand"
        note="vraag gesteld, geen antwoord"
        items={they_owe}
        empty="Je wacht nergens op."
        doneLabel="Herinner"
      />
    </div>
  );
}

function FallbackGroup({
  title,
  note,
  items,
  empty,
  doneLabel,
}: {
  title: string;
  note: string;
  items: LooseEnd[];
  empty: string;
  doneLabel: string;
}) {
  return (
    <section className="section">
      <div className="section__head">
        <h2>{title}</h2>
        <span className="section__note">{note}</span>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <strong>{empty}</strong>
          Dat is de bedoeling. Dit blok hoort leeg te kunnen zijn.
        </div>
      ) : (
        <ul className="list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="row">
                <div className="row__body">
                  <span className="row__title">
                    {item.party}: {item.what}
                  </span>
                  {item.context && <span className="row__sub">{item.context}</span>}
                  <div className="chips">
                    <span className="chip">{durationPhrase(item.opened_at)} open</span>
                    <span className="chip">{item.source_label}</span>
                    {item.project && <span className="chip chip--accent">{item.project}</span>}
                  </div>
                  <div className="row__actions">
                    <form action={resolveCommitment.bind(null, item.id, "done", 0)}>
                      <button
                        className="btn btn--quiet"
                        type="submit"
                        aria-label={`${doneLabel}: ${item.party} — ${item.what}`}
                      >
                        {doneLabel}
                      </button>
                    </form>
                    <form
                      action={resolveCommitment.bind(null, item.id, "snoozed", SNOOZE_DAYS)}
                    >
                      <button
                        className="btn btn--quiet"
                        type="submit"
                        aria-label={`Later: ${item.party} — ${item.what}`}
                      >
                        Later
                      </button>
                    </form>
                    <form action={resolveCommitment.bind(null, item.id, "dismissed", 0)}>
                      <button
                        className="btn btn--text"
                        type="submit"
                        aria-label={`Laat vallen: ${item.party} — ${item.what}`}
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
  );
}
