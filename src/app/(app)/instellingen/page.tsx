import { EmailForm } from "./EmailForm";
import { RUN_KINDS, RUN_LABELS } from "@/lib/runs/schedule";
import { currentUserId, withUser } from "@/lib/db/client";
import { decideTool, setConnectorPermission, updateRun } from "@/lib/actions";
import { PERMISSION_LABELS } from "@/lib/types";
import Link from "next/link";
import { durationPhrase, formatDayShort, formatTime } from "@/lib/text";
import { pendingToolCalls, recentToolCalls } from "@/lib/tools/execute";
import { SUGGESTED_QUERIES } from "@/lib/graphify/query";
import { signOut } from "../../../../auth";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  active: "werkt",
  error: "was niet bereikbaar",
  reauth_required: "vraagt opnieuw toestemming",
  not_connected: "niet gekoppeld",
};

/** Toolnamen zijn voor de machine; hier staat wat het voor jou betekent. */
const LOG_STATUS: Record<string, string> = {
  done: "gedraaid",
  skipped: "overgeslagen — niets te melden",
  failed: "mislukt",
};

const TOOL_TEXT: Record<string, string> = {
  "gmail.draft_reply": "concept in Gmail",
  "calendar.create_event": "afspraak in je agenda",
  "calendar.list_day": "agenda lezen",
};

const OUTCOME_TEXT: Record<string, string> = {
  done: "gedaan",
  failed: "ging mis",
  rejected: "liet je vallen",
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
  const [connectors, settings, runs, laatsteLogs, gebruiker] = await withUser(userId, (tx) =>
    Promise.all([
      tx.connector.findMany({ where: { user_id: userId }, orderBy: { type: "asc" } }),
      tx.userSetting.findMany({ where: { user_id: userId } }),
      tx.scheduledRun.findMany({ where: { user_id: userId } }),
      tx.runLog.findMany({ where: { user_id: userId }, orderBy: { ran_at: "desc" }, take: 6 }),
          tx.user.findUnique({ where: { id: userId }, select: { email: true } }),
    ]),
  );
  const [pending, recent] = await Promise.all([
    pendingToolCalls(userId),
    recentToolCalls(userId),
  ]);

  const setting = (key: string) => settings.find((s) => s.key === key)?.value;
  const allConnected = connectors.length > 0 && connectors.every((connector) => connector.status === "active");

  return (
    <>
      <p className="eyebrow">Zeggenschap</p>
      <h1 className="screen-title">Instellingen</h1>

      <section className="section">
        <div className="section__head">
          <h2>Bronnen</h2>
          <span className="section__note">status en wat ik ermee mag</span>
        </div>

        <ul className="list settings-sources">
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

      <section className="connector-summary" data-ok={allConnected}>
        <strong>{allConnected ? "Alles verbonden" : "Aandacht nodig"}</strong>
        <span>
          {allConnected
            ? "Je bronnen zijn beschikbaar voor je volgende briefing."
            : "Een of meer bronnen hebben opnieuw aandacht nodig."}
        </span>
      </section>

      {pending.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2>Wil je dit?</h2>
            <span className="section__note">wacht op jou, er is nog niets gebeurd</span>
          </div>
          <ul className="list">
            {pending.map((call) => (
              <li key={call.id}>
                <div className="row">
                  <div className="row__body">
                    <span className="row__title">{call.summary}</span>
                    <span className="row__sub">
                      {TOOL_TEXT[call.tool] ?? call.tool} · {durationPhrase(call.created_at)} open
                    </span>
                  </div>
                  {/* Nee is even makkelijk als ja (regel 4): geen bevestiging,
                      geen waarschuwing, dezelfde plek. */}
                  <div className="btn-row">
                    <form action={decideFromForm.bind(null, call.id, "approve")}>
                      <button className="btn btn--text" type="submit">
                        Doen
                      </button>
                    </form>
                    <form action={decideFromForm.bind(null, call.id, "reject")}>
                      <button className="btn btn--text" type="submit">
                        Niet doen
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2>Wat ik deed</h2>
            <span className="section__note">laatste acties bij je bronnen</span>
          </div>
          <ul className="list">
            {recent.slice(0, 5).map((call) => (
              <li key={call.id}>
                <div className="row">
                  <div className="row__body">
                    <span className="row__title">{call.summary}</span>
                    <span className="row__sub">
                      {OUTCOME_TEXT[call.status] ?? call.status}
                      {call.finished_at ? ` · ${formatDayShort(call.finished_at)}` : ""}
                      {call.error_message ? ` · ${call.error_message}` : ""}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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
          <h2>Momenten</h2>
          <span className="section__note">drie vaste, tijdstip mag je verzetten</span>
        </div>
        <p className="row__sub" style={{ maxWidth: "var(--measure)" }}>
          Het middagmoment zwijgt op een dag zonder afwijking. Dat is geen storing: een
          bijsturing zonder aanleiding is ruis.
        </p>
        <ul className="list" style={{ marginTop: "var(--s-3)" }}>
          {RUN_KINDS.map((kind) => {
            const run = runs.find((r) => r.kind === kind);
            const log = laatsteLogs.find((l) => l.kind === kind);
            return (
              <li key={kind}>
                <form action={updateRun.bind(null, kind)} className="run-row">
                  <div className="run-row__naam">
                    <div>{RUN_LABELS[kind]}</div>
                    <div className="conn__status">
                      {log
                        ? `laatst ${LOG_STATUS[log.status] ?? log.status} op ${log.local_date}${log.notified ? " · gemeld" : ""}`
                        : "nog niet gedraaid"}
                    </div>
                  </div>
                  <div className="run-row__bediening">
                  <label className="sr-only" htmlFor={`at-${kind}`}>
                    Tijdstip voor {RUN_LABELS[kind]}
                  </label>
                  <input
                    id={`at-${kind}`}
                    className="input input--time"
                    type="time"
                    name="at"
                    defaultValue={run?.at ?? "08:00"}
                  />
                  <label className="run-toggle">
                    <input
                      type="checkbox"
                      className="check"
                      name="enabled"
                      defaultChecked={run?.enabled ?? true}
                    />
                    aan
                  </label>
                    <button
                      className="btn btn--text"
                      type="submit"
                      aria-label={`Opslaan: ${RUN_LABELS[kind]}`}
                    >
                      Opslaan
                    </button>
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Meldingen</h2>
        </div>

        {/* Het adres staat hier en niet onder "je gegevens": het bepaalt waar
            de briefing van 08:00 heen gaat, en dat is wat je hier komt doen. */}
        <EmailForm huidig={gebruiker?.email ?? ""} />

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

async function decideFromForm(id: string, decision: "approve" | "reject") {
  "use server";
  await decideTool(id, decision);
}

async function logout() {
  "use server";
  await signOut({ redirectTo: "/inloggen" });
}
