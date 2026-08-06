import { currentUserId, withUser } from "@/lib/db/client";
import { triageInbox } from "@/lib/actions";
import { CaptureField } from "@/components/CaptureField";

export const dynamic = "force-dynamic";

/**
 * Inbox (§6.8) — één item tegelijk triëren, vier uitgangen, geen submenu's.
 * De snelste route is altijd zichtbaar: elk item is in één klik weg.
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
      <p className="eyebrow">Eerst even kijken</p>
      <h1 className="screen-title">Inbox</h1>
      <p className="lede screen-lede">Geef ieder signaal een rustige volgende stap.</p>

      {items.length === 0 ? (
        <div className="empty" style={{ marginTop: "var(--s-5)" }}>
          <strong>Leeg.</strong>
          Wat je onderweg vastlegt — via de app, Siri of een doorgestuurde mail — landt hier.
        </div>
      ) : (
        <ul className="action-cards">
          {items.map((item) => (
            <li key={item.id}>
              <div className="action-card">
                <div className="row__body">
                  <span className="row__title">{item.text}</span>
                  <span className="row__sub">via {SOURCE_LABEL[item.source] ?? item.source}</span>
                  <div className="row__actions">
                    <form action={triageInbox.bind(null, item.id, "frog")}>
                      <button
                        className="btn btn--quiet"
                        type="submit"
                        aria-label={`Maak frog van: ${item.text}`}
                      >
                        Frog
                      </button>
                    </form>
                    <form action={triageInbox.bind(null, item.id, "priority")}>
                      <button
                        className="btn btn--quiet"
                        type="submit"
                        aria-label={`Maak prioriteit van: ${item.text}`}
                      >
                        Prioriteit
                      </button>
                    </form>
                    <form action={triageInbox.bind(null, item.id, "commitment")}>
                      <button
                        className="btn btn--quiet"
                        type="submit"
                        aria-label={`Maak open eindje van: ${item.text}`}
                      >
                        Open eindje
                      </button>
                    </form>
                    <form action={triageInbox.bind(null, item.id, "dropped")}>
                      <button
                        className="btn btn--text"
                        type="submit"
                        aria-label={`Weg: ${item.text}`}
                      >
                        Verwijder
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CaptureField />
    </>
  );
}
