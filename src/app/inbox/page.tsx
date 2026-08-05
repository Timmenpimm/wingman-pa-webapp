import { prisma, currentUserId } from "@/lib/db/client";
import { triageInbox } from "@/lib/actions";
import { CaptureField } from "@/components/CaptureField";

export const dynamic = "force-dynamic";

/**
 * Inbox (§6.8) — één item tegelijk triëren, vier uitgangen, geen submenu's.
 * De snelste route is altijd zichtbaar: elk item is in één klik weg.
 */
export default async function InboxPage() {
  const userId = await currentUserId();
  const items = await prisma.inboxItem.findMany({
    where: { user_id: userId, status: "new" },
    orderBy: { created_at: "asc" },
  });

  const SOURCE_LABEL: Record<string, string> = {
    capture: "app",
    siri: "Siri",
    mail_forward: "doorgestuurde mail",
    telegram: "Telegram",
  };

  return (
    <>
      <p className="eyebrow">Ongesorteerd</p>
      <h1 style={{ fontSize: "var(--t-xl)" }}>Inbox</h1>

      {items.length === 0 ? (
        <div className="empty" style={{ marginTop: "var(--s-5)" }}>
          <strong>Leeg.</strong>
          Wat je onderweg vastlegt — via de app, Siri of een doorgestuurde mail — landt hier.
        </div>
      ) : (
        <ul className="list" style={{ marginTop: "var(--s-5)" }}>
          {items.map((item) => (
            <li key={item.id}>
              <div className="row">
                <div className="row__body">
                  <span className="row__title">{item.text}</span>
                  <span className="row__sub">via {SOURCE_LABEL[item.source] ?? item.source}</span>
                  <div className="row__actions">
                    {/* Vier keer dezelfde knoptekst per item: zonder aria-label
                        hoort een schermlezer alleen "Maak frog, Maak frog, …" */}
                    <form action={triageInbox.bind(null, item.id, "frog")}>
                      <button
                        className="btn btn--quiet"
                        type="submit"
                        aria-label={`Maak frog van: ${item.text}`}
                      >
                        Maak frog
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
                        Weg
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
