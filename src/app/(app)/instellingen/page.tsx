import { EmailForm } from "./EmailForm";
import { RUN_KINDS, RUN_LABELS } from "@/lib/runs/schedule";
import { currentUserId, withUser } from "@/lib/db/client";
import { connectGoogle, decideTool, deleteAccount, setConnectorPermission, updateRun } from "@/lib/actions";
import { PERMISSION_LABELS } from "@/lib/types";
import { addableRows, catalogRows } from "@/connectors/catalog";
import { authUrlFor } from "@/connectors";
import { marksFromSettings } from "@/lib/onboarding/steps";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { SourceIcon } from "@/components/SourceIcon";
import { durationPhrase, formatDayShort, formatTime } from "@/lib/text";
import { pendingToolCalls, recentToolCalls } from "@/lib/tools/execute";
import { SUGGESTED_QUERIES } from "@/lib/graphify/query";
import { signOut } from "../../../../auth";
import "./screen.css";

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
          tx.user.findUnique({ where: { id: userId }, select: { email: true, name: true } }),
    ]),
  );
  const [pending, recent] = await Promise.all([
    pendingToolCalls(userId),
    recentToolCalls(userId),
  ]);

  const setting = (key: string) => settings.find((s) => s.key === key)?.value;

  // Een rij in `not_connected` is geen bron die je hébt: een permissiekeuze
  // voor een bron die niets doet is een knop zonder gevolg. Die hoort hieronder
  // bij "Bron toevoegen" thuis, en daar staat hij nu ook — anders twee keer.
  const gekoppeld = connectors.filter((c) => c.status !== "not_connected");

  // Wat er nog bij kan. Zonder dit blok is de onboarding de enige plek waar je
  // een bron toevoegt, en wie de bank daar oversloeg kwam er nooit meer langs.
  const teKoppelen = addableRows(
    catalogRows({
      connected: gekoppeld.map((c) => c.provider),
      marks: marksFromSettings(settings),
      googleConfigured: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
      pontoUrl: authUrlFor("ponto"),
    }),
  );
  const allConnected = gekoppeld.length > 0 && gekoppeld.every((connector) => connector.status === "active");
  const lastSync = gekoppeld.reduce<Date | null>((acc, c) => {
    if (!c.last_sync_at) return acc;
    const d = new Date(c.last_sync_at);
    return !acc || d > acc ? d : acc;
  }, null);

  return (
    <>
      <div className="st-head">
        <p className="eyebrow">Zeggenschap</p>
        <span className="st-head__space">Jouw ruimte</span>
      </div>
      <h1 className="screen-title">Instellingen</h1>

      <div className="st-profile">
        <span className="st-profile__avatar" aria-hidden="true">
          {(gebruiker?.name ?? gebruiker?.email ?? "?").trim().charAt(0).toUpperCase()}
        </span>
        <div>
          <span className="st-profile__name">{gebruiker?.name ?? "Naamloos"}</span>
          <span className="st-profile__email">{gebruiker?.email}</span>
        </div>
      </div>

      <section className="st-sec">
        <div className="st-sec__head">
          <h2>Bronnen &amp; permissies</h2>
        </div>

        <ul className="st-rows">
          {gekoppeld.map((c) => (
            <li key={c.id}>
              <div className="st-row">
                <SourceIcon kind={c.provider} size="sm" />
                <div className="st-row__body">
                  <span className="st-row__title">{c.label}</span>
                  <span className="st-row__sub" data-status={c.status}>
                    {STATUS_TEXT[c.status] ?? c.status}
                    {c.last_sync_at ? ` · laatst gelezen ${formatTime(c.last_sync_at)}` : ""}
                    {c.consent_expires_at
                      ? ` · toestemming verloopt ${formatDayShort(c.consent_expires_at)}`
                      : ""}
                  </span>
                  {c.error_message && <span className="st-row__sub">{c.error_message}</span>}
                </div>

                {/* De permissiegradiënt heeft vier standen (§6.7) — dat is een
                    productregel, dus een select en geen aan/uit-schakelaar. */}
                <form action={setPermissionFromForm.bind(null, c.id)} className="st-perm">
                  <label className="sr-only" htmlFor={`perm-${c.id}`}>
                    Permissie voor {c.label}
                  </label>
                  <select
                    id={`perm-${c.id}`}
                    name="permission"
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
              </div>
            </li>
          ))}
        </ul>
      </section>

      {teKoppelen.length > 0 && (
        <section className="st-sec">
          <div className="st-sec__head">
            <h2>Bron toevoegen</h2>
            <span className="st-sec__note">wat er nog bij kan</span>
          </div>

          <ul className="st-rows">
            {teKoppelen.map((bron) => (
              <li key={bron.provider}>
                <div className="st-row">
                  <SourceIcon kind={bron.provider} size="sm" />
                  <div className="st-row__body">
                    <span className="st-row__title">{bron.label}</span>
                    <span className="st-row__sub">
                      {bron.skipped ? "je sloeg deze over · " : ""}
                      {bron.note}
                    </span>
                  </div>

                  {/* Geen knop zonder weg naar buiten: een "Koppelen" die
                      achter de schermen 501 teruggeeft is erger dan geen knop. */}
                  {bron.connect?.kind === "google" ? (
                    <form action={connectGoogleFromSettings}>
                      <button className="btn btn--text" type="submit">
                        Koppelen
                      </button>
                    </form>
                  ) : bron.connect ? (
                    <Link className="btn btn--text" href={bron.connect.href}>
                      Koppelen
                    </Link>
                  ) : (
                    <span className="st-row__sub">kan nog niet</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="st-sec">
        <div className="st-sec__head">
          <h2>Connectorstatus</h2>
        </div>
        <div className="st-status" data-ok={allConnected}>
          <strong>{allConnected ? "Alles verbonden" : "Aandacht nodig"}</strong>
          <span>
            {allConnected
              ? lastSync
                ? `Laatste synchronisatie om ${formatTime(lastSync)}.`
                : "Je bronnen zijn beschikbaar voor je volgende briefing."
              : "Een of meer bronnen hebben opnieuw aandacht nodig."}
          </span>
        </div>
      </section>

      {pending.length > 0 && (
        <section className="st-sec">
          <div className="st-sec__head">
            <h2>Wil je dit?</h2>
            <span className="st-sec__note">wacht op jou, er is nog niets gebeurd</span>
          </div>
          <ul className="st-rows">
            {pending.map((call) => (
              <li key={call.id}>
                <div className="st-row">
                  <div className="st-row__body">
                    <span className="st-row__title">{call.summary}</span>
                    <span className="st-row__sub">
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
        <section className="st-sec">
          <div className="st-sec__head">
            <h2>Wat ik deed</h2>
            <span className="st-sec__note">laatste acties bij je bronnen</span>
          </div>
          <ul className="st-rows">
            {recent.slice(0, 5).map((call) => (
              <li key={call.id}>
                <div className="st-row">
                  <div className="st-row__body">
                    <span className="st-row__title">{call.summary}</span>
                    <span className="st-row__sub">
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

      <section className="st-sec">
        <div className="st-sec__head">
          <h2>Inzicht</h2>
          <span className="st-sec__note">privé, EU, versleuteld</span>
        </div>
        <p className="st-row__sub" style={{ maxWidth: "var(--measure)" }}>
          Alles wat ik lees komt samen in één datakoppeling: mensen, projecten, beloftes,
          transacties. Die kun je in gewone taal bevragen.
        </p>
        <ul className="st-rows" style={{ marginTop: "var(--s-2)" }}>
          {SUGGESTED_QUERIES.slice(0, 3).map((q) => (
            <li key={q}>
              <div className="st-row">
                <div className="st-row__body">
                  <Link className="st-row__title" href={`/inzicht?q=${encodeURIComponent(q)}`}>
                    {q}
                  </Link>
                </div>
                <CaretRight className="st-rule__chev" aria-hidden="true" />
              </div>
            </li>
          ))}
        </ul>
        <div className="btn-row" style={{ marginTop: "var(--s-3)" }}>
          <Link className="btn btn--quiet" href="/inzicht">
            Verbindingen verkennen
          </Link>
        </div>
      </section>

      <section className="st-sec">
        <div className="st-sec__head">
          <h2>Jouw regels</h2>
        </div>
        <p className="st-row__sub" style={{ maxWidth: "var(--measure)" }}>
          Het middagmoment zwijgt op een dag zonder afwijking. Dat is geen storing: een
          bijsturing zonder aanleiding is ruis.
        </p>
        <ul className="st-rows" style={{ marginTop: "var(--s-2)" }}>
          {RUN_KINDS.map((kind) => {
            const run = runs.find((r) => r.kind === kind);
            const log = laatsteLogs.find((l) => l.kind === kind);
            const [moment, omschrijving] = RUN_LABELS[kind].split(" — ");
            return (
              <li key={kind}>
                <details className="st-rule">
                  <summary>
                    <span className="st-row__body">
                      <span className="st-row__title">{moment}</span>
                      <span className="st-row__sub">
                        {run?.at ?? "08:00"}
                        {omschrijving ? ` · ${omschrijving}` : ""}
                      </span>
                    </span>
                    <CaretRight className="st-rule__chev" aria-hidden="true" />
                  </summary>
                  <form action={updateRun.bind(null, kind)} className="st-rule__form">
                    <label className="sr-only" htmlFor={`at-${kind}`}>
                      Tijdstip voor {RUN_LABELS[kind]}
                    </label>
                    <input
                      id={`at-${kind}`}
                      className="st-rule__time"
                      type="time"
                      name="at"
                      defaultValue={run?.at ?? "08:00"}
                    />
                    <label className="st-toggle">
                      <input
                        type="checkbox"
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
                  </form>
                  <p className="st-row__sub" style={{ margin: "0 0 var(--s-3)" }}>
                    {log
                      ? `laatst ${LOG_STATUS[log.status] ?? log.status} op ${log.local_date}${log.notified ? " · gemeld" : ""}`
                      : "nog niet gedraaid"}
                  </p>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="st-sec">
        <div className="st-sec__head">
          <h2>Meldingen</h2>
        </div>

        {/* Het adres staat hier en niet onder "je gegevens": het bepaalt waar
            de briefing van 08:00 heen gaat, en dat is wat je hier komt doen. */}
        <EmailForm huidig={gebruiker?.email ?? ""} />

        <ul className="st-rows" style={{ marginTop: "var(--s-2)" }}>
          <li>
            <div className="st-row">
              <div className="st-row__body">
                <span className="st-row__title">Stille uren</span>
                <span className="st-row__sub">{setting("quiet_hours") ?? "niet ingesteld"}</span>
              </div>
            </div>
          </li>
          <li>
            <div className="st-row">
              <div className="st-row__body">
                <span className="st-row__title">Kanaal</span>
                <span className="st-row__sub">{setting("channel") ?? "push+mail"}</span>
              </div>
            </div>
          </li>
          <li>
            <div className="st-row">
              <div className="st-row__body">
                <span className="st-row__title">Gevoelige details in meldingen</span>
                <span className="st-row__sub">
                  {setting("sensitive_in_push") === "true"
                    ? "staat aan — bedragen en namen komen in de melding"
                    : "staat uit — meldingen zeggen alleen dat er iets is"}
                </span>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section className="st-sec">
        <div className="st-sec__head">
          <h2>Je gegevens</h2>
        </div>
        <p className="st-row__sub" style={{ maxWidth: "var(--measure)" }}>
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
        {/* <details> als bevestigingsstap: geen browser-confirm, en werkt
            zonder client-JS (zelfde patroon als "Jouw regels" hierboven).
            Openklappen is de eerste stap, de knop erin de tweede — dat is
            de "expliciete bevestiging" zonder er een aparte pagina van te
            maken. */}
        <details className="st-rule" style={{ marginTop: "var(--s-4)" }}>
          <summary>
            <span className="st-row__body">
              <span className="st-row__title">Account verwijderen</span>
              <span className="st-row__sub">definitief, kan niet ongedaan worden gemaakt</span>
            </span>
            <CaretRight className="st-rule__chev" aria-hidden="true" />
          </summary>
          <p className="st-row__sub" style={{ maxWidth: "var(--measure)", margin: "0 0 var(--s-3)" }}>
            Dit verwijdert je account en alles daarbinnen: gekoppelde bronnen, agenda- en
            mailgegevens, transacties, projecten, prioriteiten en logboeken. Er is geen
            herstelpad.
          </p>
          <form action={verwijderAccount} style={{ paddingBottom: "var(--s-4)" }}>
            <button className="btn btn--quiet" type="submit">
              Ja, mijn account definitief verwijderen
            </button>
          </form>
        </details>
      </section>
    </>
  );
}

async function setPermissionFromForm(id: string, data: FormData) {
  "use server";
  await setConnectorPermission(id, String(data.get("permission") ?? "propose"));
}

/** Koppelen vanaf Instellingen komt ook op Instellingen terug, niet in de wizard. */
async function connectGoogleFromSettings() {
  "use server";
  await connectGoogle("instellingen");
}

async function decideFromForm(id: string, decision: "approve" | "reject") {
  "use server";
  await decideTool(id, decision);
}

async function logout() {
  "use server";
  await signOut({ redirectTo: "/inloggen" });
}

/** Verwijderen en meteen uitloggen: de sessie hangt aan een userId die na
 * deleteAccount() niet meer bestaat, dus die kan hierna toch nergens meer
 * geldig tegen aanlopen. */
async function verwijderAccount() {
  "use server";
  await deleteAccount();
  await signOut({ redirectTo: "/inloggen" });
}
