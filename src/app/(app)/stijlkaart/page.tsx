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
      <h1 className="screen-title">Jouw stijlkaart</h1>
      <p className="lede screen-lede">Drie registers die je vanzelf inzet, afhankelijk van de situatie.</p>

      <div className="style-registers">
        {cards.map((c, index) => {
          const typical = JSON.parse(c.typical) as string[];
          return (
            <article key={c.id} className="style-register" data-tone={index % 3}>
              <h2>{REGISTER_LABEL[c.register] ?? c.register}</h2>
              <p className="style-register__quote">“{clamp(typical[0] ?? c.greeting, "styleCardLine")}”</p>
              <details className="style-register__edit">
                <summary>Bijstellen</summary>
                <form action={saveRegister.bind(null, c.register)} className="stack">
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
              </details>
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
