import { prisma, currentUserId } from "@/lib/db/client";
import { setConnectorPermission } from "@/lib/actions";
import { PERMISSION_LABELS } from "@/lib/types";
import Link from "next/link";
import { formatDayShort, formatTime } from "@/lib/text";
import { SUGGESTED_QUERIES } from "@/lib/graphify/query";
import { signOut } from "../../../auth";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  active: "werkt",
  error: "was niet bereikbaar",
  reauth_required: "vraagt opnieuw toestemming",
  not_connected: "niet gekoppeld",
};

/**
 * Instellingen (§6.7) — permissies en connector-gezondheid zijn hier geen
 * bijzaak.
 *
 * Een verlopen token betekent dat je briefing onvolledig was. Dat moet je zien
 * vóórdat je erop vertrouwt, dus staat de gezondheid bovenaan en niet in een
 * uitklapper.
 */
export default async function InstellingenPage() {
  const userId = await currentUserId();
  const [connectors, settings] = await Promise.all([
    prisma.connector.findMany({ where: { user_id: userId }, orderBy: { type: "asc" } }),
    prisma.userSetting.findMany({ where: { user_id: userId } }),
  ]);

  const setting = (key: string) => settings.find((s) => s.key === key)?.value;

  return (
    <>
      <p className="eyebrow">Wat mag ik, en werkt het nog</p>
      <h1 style={{ fontSize: "var(--t-xl)" }}>Instellingen</h1>

      <section className="section">
        <div className="section__head">
          <h2>Bronnen</h2>
          <span className="section__note">status en wat ik ermee mag</span>
        </div>

        <ul className="list">
          {connectors.map((c) => (
            <li key={c.id} className="conn">
            <div className="conn__name">
              <div>{c.label}</div>
              <div className="conn__status" data-status={c.status}>
                {STATUS_TEXT[c.status] ?? c.status}
                {c.last_sync_at ? ` · laatst gelezen ${formatTime(c.last_sync_at)}` : ""}
                {c.consent_expires_at
                  ? ` · toestemming verloopt ${formatDayShort(c.consent_expires_at)}`
                  : ""}
              </div>
              {c.error_message && <div className="row__sub">{c.error_message}</div>}
            </div>

            <form action={setPermissionFromForm.bind(null, c.id)}>
              <label className="sr-only" htmlFor={`perm-${c.id}`}>
                Permissie voor {c.label}
              </label>
              <select
                id={`perm-${c.id}`}
                name="permission"
                className="select"
                defaultValue={c.permission}
              >
                {Object.entries(PERMISSION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                className="btn btn--text"
                type="submit"
                aria-label={`Permissie opslaan voor ${c.label}`}
              >
                Opslaan
              </button>
            </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Kennisgraaf</h2>
          <span className="section__note">privé, EU, versleuteld</span>
        </div>
        <p className="row__sub" style={{ maxWidth: "var(--measure)" }}>
          Alles wat ik lees komt samen in één graaf: mensen, projecten, beloftes,
          transacties. Die kun je in gewone taal bevragen.
        </p>
        <ul className="list" style={{ marginTop: "var(--s-3)" }}>
          {SUGGESTED_QUERIES.slice(0, 3).map((q) => (
            <li key={q}>
              <div className="row">
                <div className="row__body">
                  <Link className="row__title" href={`/graaf?q=${encodeURIComponent(q)}`}>
                    {q}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="btn-row" style={{ marginTop: "var(--s-4)" }}>
          <Link className="btn btn--quiet" href="/graaf">
            Graaf verkennen
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Meldingen</h2>
        </div>
        <ul className="list">
          <li>
            <div className="row">
              <div className="row__body">
                <span className="row__title">Stille uren</span>
                <span className="row__sub">{setting("quiet_hours") ?? "niet ingesteld"}</span>
              </div>
            </div>
          </li>
          <li>
            <div className="row">
              <div className="row__body">
                <span className="row__title">Kanaal</span>
                <span className="row__sub">{setting("channel") ?? "push+mail"}</span>
              </div>
            </div>
          </li>
          <li>
            <div className="row">
              <div className="row__body">
                <span className="row__title">Gevoelige details in meldingen</span>
                <span className="row__sub">
                  {setting("sensitive_in_push") === "true"
                    ? "staat aan — bedragen en namen komen in de melding"
                    : "staat uit — meldingen zeggen alleen dat er iets is"}
                </span>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Je gegevens</h2>
        </div>
        <p className="row__sub" style={{ maxWidth: "var(--measure)" }}>
          Alles staat per gebruiker apart, in de EU, versleuteld. Er wordt niet op getraind.
          Schulden, gezondheid en uitkering vallen onder bijzondere categorieën — die data
          verlaat je account niet en komt standaard niet in meldingen.
        </p>
        <div className="btn-row" style={{ marginTop: "var(--s-4)" }}>
          <a className="btn btn--quiet" href="/api/v1/export" download="wingman-export.json">
            Alles exporteren
          </a>
          <form action={logout}>
            <button className="btn btn--quiet" type="submit">
              Uitloggen
            </button>
          </form>
        </div>
        {/* Geen knop voor verwijderen zolang die niets doet: een dode knop die
            "account verwijderen" belooft is erger dan geen knop. */}
        <p className="meta" style={{ marginTop: "var(--s-3)" }}>
          Verwijderen van je account kan nog niet vanuit de app — dat komt samen met
          accounts en inloggen.
        </p>
      </section>
    </>
  );
}

async function setPermissionFromForm(id: string, data: FormData) {
  "use server";
  await setConnectorPermission(id, String(data.get("permission") ?? "propose"));
}

async function logout() {
  "use server";
  await signOut({ redirectTo: "/inloggen" });
}
