import { currentUserId, withUser } from "@/lib/db/client";
import { updateStyleCard } from "@/lib/actions";
import { clamp } from "@/lib/text";

export const dynamic = "force-dynamic";

const REGISTER_LABEL: Record<string, string> = {
  bekenden: "Bekenden",
  zakelijk_eerste_contact: "Zakelijk — eerste contact",
  instanties: "Instanties",
};

/**
 * Stijlkaart (§6.6) — "zo schrijf jij", uit verzonden mail.
 *
 * Voelt als een profielkaart, niet als instellingen. Alles is bewerkbaar, want
 * hij zit er soms naast en dan moet je dat kunnen rechtzetten zonder gedoe.
 */
export default async function StijlkaartPage() {
  const userId = await currentUserId();
  const cards = await withUser(userId, (tx) => tx.styleCard.findMany({ where: { user_id: userId } }));

  return (
    <>
      <p className="eyebrow">Uit je verzonden mail</p>
      <h1 style={{ fontSize: "var(--t-xl)" }}>Zo schrijf jij</h1>
      <p className="lede" style={{ marginTop: "var(--s-3)" }}>
        Ik verstuur niets. Ik lees alleen mee hoe jij schrijft, zodat een concept straks
        klinkt als jij en niet als een assistent.
      </p>

      <div className="cards" style={{ marginTop: "var(--s-5)" }}>
        {cards.map((c) => {
          const typical = JSON.parse(c.typical) as string[];
          return (
            <article key={c.id} className="card">
              <h2 className="card__title">{REGISTER_LABEL[c.register] ?? c.register}</h2>
              <p className="card__line">Gemiddeld {c.avg_words} woorden per bericht.</p>
              {/* Bewerkbaar, want hij zit er soms naast (§6.6). Geen aparte
                  bewerkmodus: de velden staan er gewoon, opslaan is één klik. */}
              <form
                action={saveRegister.bind(null, c.register)}
                className="stack"
                style={{ marginTop: "var(--s-3)" }}
              >
                <label className="row__sub" htmlFor={`greeting-${c.id}`}>
                  <strong className="muted">Aanhef</strong>
                </label>
                <input
                  id={`greeting-${c.id}`}
                  name="greeting"
                  className="input"
                  defaultValue={c.greeting}
                  maxLength={80}
                />

                <label className="row__sub" htmlFor={`signoff-${c.id}`}>
                  <strong className="muted">Afsluiting</strong>
                </label>
                <textarea
                  id={`signoff-${c.id}`}
                  name="signoff"
                  className="input"
                  rows={2}
                  defaultValue={c.signoff}
                  maxLength={160}
                />

                <button
                  className="btn btn--quiet"
                  type="submit"
                  aria-label={`Opslaan: ${REGISTER_LABEL[c.register] ?? c.register}`}
                >
                  Opslaan
                </button>
              </form>

              <div className="stack" style={{ marginTop: "var(--s-4)" }}>
                <p className="row__sub">
                  <strong className="muted">Typische zinnen</strong>
                </p>
                <ul className="list">
                  {typical.map((t) => (
                    <li key={t}>
                      <div className="row">
                        <span className="row__title" style={{ fontSize: "var(--t-sm)" }}>
                          {clamp(t, "styleCardLine")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="chips">
                <span className="chip">{c.edited_by_user ? "door jou aangepast" : "afgeleid"}</span>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

/**
 * De correctie gaat via dezelfde functie als POST /api/v1/style-card, zodat
 * scherm en API niet uit elkaar kunnen lopen.
 */
async function saveRegister(register: string, data: FormData) {
  "use server";
  await updateStyleCard(register, {
    greeting: String(data.get("greeting") ?? ""),
    signoff: String(data.get("signoff") ?? ""),
  });
}
