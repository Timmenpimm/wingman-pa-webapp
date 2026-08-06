import { currentUserId, withUser } from "@/lib/db/client";
import { triageInbox } from "@/lib/actions";
import { CaptureField } from "@/components/CaptureField";
import { Bird, ListBullets, CheckCircle, Trash } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

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
    mail_forward: "mail",
    telegram: "Telegram",
  };

  return (
    <>
      <p className="eyebrow">Eerst even kijken</p>
      <h1 className="screen-title">Inbox</h1>
      <p className="lede screen-lede">Vier manieren om elk item weg te werken.</p>

      {items.length === 0 ? (
        <div className="empty" style={{ marginTop: "var(--s-5)" }}>
          <strong>Leeg.</strong>
          Wat je onderweg vastlegt — via de app, Siri of doorgestuurde mail — verschijnt hier.
        </div>
      ) : (
        <ul className="inbox-list">
          {items.map((item) => (
            <li key={item.id} className="inbox-item">
              <div className="inbox-item__content">
                <p className="inbox-item__text">{item.text}</p>
                <span className="inbox-item__source">via {SOURCE_LABEL[item.source] ?? item.source}</span>
              </div>

              <div className="inbox-item__actions">
                <form action={triageInbox.bind(null, item.id, "frog")}>
                  <button
                    className="inbox-btn inbox-btn--frog"
                    type="submit"
                    title="Vandaag: één ding"
                    aria-label={`Maak dit de frog: ${item.text}`}
                  >
                    <Bird weight="regular" />
                    <span className="sr-only">Frog</span>
                  </button>
                </form>

                <form action={triageInbox.bind(null, item.id, "priority")}>
                  <button
                    className="inbox-btn inbox-btn--priority"
                    type="submit"
                    title="Top 3 prioriteiten"
                    aria-label={`Maak dit prioriteit: ${item.text}`}
                  >
                    <ListBullets weight="regular" />
                    <span className="sr-only">Prioriteit</span>
                  </button>
                </form>

                <form action={triageInbox.bind(null, item.id, "commitment")}>
                  <button
                    className="inbox-btn inbox-btn--commitment"
                    type="submit"
                    title="Open eindje: ik of ander"
                    aria-label={`Maak dit open eindje: ${item.text}`}
                  >
                    <CheckCircle weight="regular" />
                    <span className="sr-only">Open eindje</span>
                  </button>
                </form>

                <form action={triageInbox.bind(null, item.id, "dropped")}>
                  <button
                    className="inbox-btn inbox-btn--remove"
                    type="submit"
                    title="Verwijder"
                    aria-label={`Verwijder: ${item.text}`}
                  >
                    <Trash weight="regular" />
                    <span className="sr-only">Verwijder</span>
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
