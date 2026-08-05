import Link from "next/link";
import { prisma, currentUserId } from "@/lib/db/client";
import { formatAmount } from "@/lib/text";

export const dynamic = "force-dynamic";

/**
 * Onboarding (§6.3).
 *
 * De regel die dit scherm draagt: na elke koppeling meteen iets teruggeven.
 * Vier OAuth-knoppen op een rij en dan een leeg dashboard is precies hoe je
 * iemand kwijtraakt. Elke stap hieronder heeft dus een payoff-regel die uit de
 * net gekoppelde bron komt.
 */
export default async function OnboardingPage() {
  const userId = await currentUserId();
  const [connectors, txs, people] = await Promise.all([
    prisma.connector.findMany({ where: { user_id: userId } }),
    prisma.transaction.findMany({
      where: { user_id: userId },
      orderBy: { booked_at: "desc" },
      take: 5,
    }),
    prisma.person.count({ where: { user_id: userId } }),
  ]);

  const connected = (provider: string) =>
    connectors.some((c) => c.provider === provider && c.status !== "not_connected");

  const inkomsten = txs.filter((t) => t.amount > 0);
  const teControleren = txs.filter((t) => t.needs_review);

  return (
    <>
      <p className="eyebrow">Koppelen</p>
      <h1 style={{ fontSize: "var(--t-xl)" }}>Wat mag ik lezen?</h1>
      <p className="lede" style={{ marginTop: "var(--s-3)" }}>
        Eén bron tegelijk. Na elke koppeling laat ik meteen zien wat ik erin zie — dan weet
        je waar je aan begint.
      </p>

      <ol className="steps">
        <li data-done={connected("google")}>
          <h2 className="step__title">Agenda koppelen</h2>
          <p className="meta">Google · Outlook · Apple/CalDAV</p>
          {connected("google") ? (
            <p className="step__payoff">
              Ik zie drie vaste blokken per week. Gym op maandag en dinsdag, en iets op
              woensdagmiddag dat elke week terugkomt.
            </p>
          ) : (
            <Link className="btn btn--quiet" href="/api/v1/connect/google">
              Agenda koppelen
            </Link>
          )}
        </li>

        <li data-done={connected("gmail")}>
          <h2 className="step__title">Mail koppelen</h2>
          <p className="meta">Gmail · Outlook · IMAP</p>
          {connected("gmail") ? (
            <p className="step__payoff">
              Ik heb {people} mensen gevonden waar je vaak mee mailt. Kloppen deze vier?
            </p>
          ) : (
            <Link className="btn btn--quiet" href="/api/v1/connect/gmail">
              Mail koppelen
            </Link>
          )}
        </li>

        <li data-done={connected("ponto")}>
          <h2 className="step__title">Bank koppelen via Ponto</h2>
          <p className="meta">één flow voor alle Europese banken · alleen lezen</p>
          {connected("ponto") ? (
            <>
              <p className="step__payoff">
                Ik zie inkomsten van je grootste opdrachtgever, vaste lasten voor huur en
                belasting, en{" "}
                {teControleren.length} transactie zonder duidelijke categorie.
              </p>
              <ul className="list" style={{ marginTop: "var(--s-3)" }}>
                {txs.map((t) => (
                  <li key={t.id}>
                    <div className="row">
                      <div className="row__body">
                        <span className="row__title">{t.counterparty ?? "Onbekend"}</span>
                        <span className="row__sub">
                          {t.description}
                          {t.needs_review ? " · categorie onduidelijk" : ` · ${t.category}`}
                        </span>
                      </div>
                      <span className={`amount${t.amount > 0 ? " amount--in" : ""}`}>
                        {formatAmount(t.amount)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="meta" style={{ marginTop: "var(--s-3)" }}>
                Totaal binnengekomen deze week:{" "}
                {formatAmount(inkomsten.reduce((s, t) => s + t.amount, 0))}. Toestemming
                verloopt na 90 dagen — dat zie je terug bij Instellingen.
              </p>
            </>
          ) : (
            <Link className="btn btn--quiet" href="/api/v1/connect/ponto">
              Bank koppelen
            </Link>
          )}
        </li>

        <li data-done={true}>
          <h2 className="step__title">Stijl uitlezen</h2>
          <p className="meta">uit je verzonden mail · v1 verstuurt niets</p>
          <p className="step__payoff">
            Ik heb drie registers gevonden: bekenden, zakelijk eerste contact, en instanties.
          </p>
          <Link className="btn btn--text" href="/stijlkaart">
            Stijlkaart bekijken
          </Link>
        </li>

        <li data-done={false}>
          <h2 className="step__title">App installeren en meldingen aanzetten</h2>
          <p className="meta">web push · mail als vangnet</p>
          <p className="step__payoff">
            Zet dit op je telefoon en je krijgt de briefing om 08:00. Zonder installatie
            stuur ik hem per mail.
          </p>
        </li>

        <li data-done={false}>
          <h2 className="step__title">Telegram koppelen (optioneel)</h2>
          <p className="meta">deeplink met QR-code, één keer scannen</p>
        </li>

        <li data-done={false}>
          <h2 className="step__title">Permissies instellen</h2>
          <p className="meta">per bron: voorstellen, concept maken, doen en melden, stil doen</p>
          <Link className="btn btn--text" href="/instellingen">
            Naar instellingen
          </Link>
        </li>
      </ol>
    </>
  );
}
