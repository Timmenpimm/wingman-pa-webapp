import { currentUserId, withUser } from "@/lib/db/client";
import { triageInbox } from "@/lib/actions";
import { CaptureField } from "@/components/CaptureField";
import { SourceIcon } from "@/components/SourceIcon";
import "./screen.css";

export const dynamic = "force-dynamic";

/**
 * Inbox (§6.8) — één item tegelijk triëren, vier uitgangen, geen submenu's.
 * De snelste route is altijd zichtbaar: elk item is in één klik weg.
 *
 * Vorm volgt design-reference/screens/13.png: compacte kaarten met titel,
 * één regel bron/context en vier chipknoppen; rechts in de kop de teller
 * "N NIEUW" (echt aantal, geen vaste "6").
 */
export default async function InboxPage() {
  const userId = await currentUserId();
  const items = await withUser(userId, (tx) =>
    tx.inboxItem.findMany({
      where: { user_id: userId, status: "new" },
      orderBy: { created_at: "asc" },
    }),
  );

  const SOURCE_LABEL: Record<string, string> = {
    capture: "app",
    siri: "Siri",
    mail_forward: "doorgestuurde mail",
    telegram: "Telegram",
  };

  return (
    <>
      <header className="ib-head">
        <div>
          <p className="eyebrow">Eerst even kijken</p>
          <h1 className="screen-title">Inbox</h1>
        </div>
        {items.length > 0 && <span className="ib-head__count">{items.length} nieuw</span>}
      </header>
      <p className="lede screen-lede">Geef ieder signaal een rustige volgende stap.</p>

      {items.length === 0 ? (
        <div className="empty" style={{ marginTop: "var(--s-5)" }}>
          <strong>Leeg.</strong>
          Wat je onderweg vastlegt — via de app, Siri of een doorgestuurde mail — landt hier.
        </div>
      ) : (
        <ul className="ib-list">
          {items.map((item) => (
            <li key={item.id} className="ib-card">
              <div className="ib-card__head">
                <SourceIcon kind={item.source} size="sm" />
                <div>
                  <p className="ib-card__title">{item.text}</p>
                  <p className="ib-card__sub">via {SOURCE_LABEL[item.source] ?? item.source}</p>
                </div>
              </div>
              <div className="ib-card__actions">
                <form action={triageInbox.bind(null, item.id, "frog")}>
                  <button
                    className="btn btn--chip"
                    type="submit"
                    aria-label={`Maak frog van: ${item.text}`}
                  >
                    Frog
                  </button>
                </form>
                <form action={triageInbox.bind(null, item.id, "priority")}>
                  <button
                    className="btn btn--chip"
                    type="submit"
                    aria-label={`Maak prioriteit van: ${item.text}`}
                  >
                    Prioriteit
                  </button>
                </form>
                <form action={triageInbox.bind(null, item.id, "commitment")}>
                  <button
                    className="btn btn--chip"
                    type="submit"
                    aria-label={`Maak open eindje van: ${item.text}`}
                  >
                    Open eindje
                  </button>
                </form>
                {/* Chip, geen verstopte tekstknop: "laat vallen" hoort even
                    makkelijk te zijn als de andere drie uitgangen. */}
                <form action={triageInbox.bind(null, item.id, "dropped")}>
                  <button
                    className="btn btn--chip"
                    type="submit"
                    aria-label={`Weg: ${item.text}`}
                  >
                    Verwijder
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CaptureField />
    </>
  );
}
