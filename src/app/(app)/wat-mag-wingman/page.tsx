import { currentUserId, withUser } from "@/lib/db/client";
import { decideMandateSuggestion, setMandate } from "@/lib/actions";
import {
  asLevel,
  DOMAIN_REGISTRY,
  DOMAINS,
  LEVELS,
  LEVEL_LABELS,
  type Domain,
} from "@/lib/mandates/domains";
import type { SuggestionEvidence } from "@/lib/mandates/suggest";
import {
  domainLevelText,
  EMPTY_WEEK_STATS,
  parseNotify,
  suggestionText,
  totalStats,
  weeklyStatsByDomain,
} from "./stats";
import "./screen.css";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * "Wat mag Wingman" (fase 2, punt 3 van de roadmap) — het scherm dat
 * vertrouwen verkoopt. Eén overzicht per domein: welk niveau er staat, wat
 * dat betekent, en wat er de afgelopen week echt mee gebeurd is.
 *
 * Bewust geen tweede weg naar de Mandate-tabel: dezelfde server-actions als
 * Instellingen (`setMandate`, `decideMandateSuggestion` in src/lib/actions.ts)
 * doen hier het schrijfwerk. Dit scherm leest alleen zijn eigen weekvenster
 * en loopt generiek over `DOMAIN_REGISTRY` — geen hardgecodeerde domeinlijst,
 * dus het klopt vanzelf zodra het domeinregister van 2 naar 9 groeit.
 *
 * Geen scores, geen badges, geen streaks (§7): een domein waar niets mee
 * gebeurd is, toont gewoon dat er niets gebeurd is.
 */
export default async function WatMagWingmanPage() {
  const userId = await currentUserId();
  const since = new Date(Date.now() - WEEK_MS);

  const [mandates, mandateSuggestion, weekCalls] = await withUser(userId, (tx) =>
    Promise.all([
      tx.mandate.findMany({ where: { user_id: userId } }),
      tx.mandateSuggestion.findFirst({
        where: { user_id: userId, status: "open" },
        orderBy: { created_at: "asc" },
      }),
      tx.toolCall.findMany({
        where: { user_id: userId, created_at: { gte: since } },
        select: { tool: true, status: true },
      }),
    ]),
  );

  const mandateByDomain = new Map(mandates.map((m) => [m.domain, m]));
  const statsByDomain = weeklyStatsByDomain(weekCalls);

  // Zelfde defensieve parse als instellingen/page.tsx: `evidence` is JSON dat
  // de vertrouwensloop zelf wegschreef. Een parsefout is corrupte data, geen
  // reden om de hele pagina te laten knappen — dan toont dit scherm de rij
  // simpelweg niet.
  const suggestion = (() => {
    if (!mandateSuggestion) return null;
    try {
      return {
        id: mandateSuggestion.id,
        domain: mandateSuggestion.domain as Domain,
        toLevel: asLevel(mandateSuggestion.to_level),
        evidence: JSON.parse(mandateSuggestion.evidence) as SuggestionEvidence,
      };
    } catch {
      return null;
    }
  })();

  return (
    <>
      <p className="eyebrow">Zeggenschap</p>
      <h1 className="screen-title">Wat mag Wingman</h1>
      <p className="lede wm-lede">
        Per domein: welk niveau er staat, wat dat concreet betekent, en wat daar deze week mee
        gebeurd is.
      </p>

      {suggestion && (
        <div className="wm-suggestion">
          <p className="wm-suggestion__title">
            {suggestionText(suggestion.domain, suggestion.evidence, suggestion.toLevel)}
          </p>
          <div className="btn-row">
            <form action={decideSuggestionFromForm.bind(null, suggestion.id, "accept")}>
              <button className="btn btn--text" type="submit">
                Doen
              </button>
            </form>
            <form action={decideSuggestionFromForm.bind(null, suggestion.id, "dismiss")}>
              <button className="btn btn--text" type="submit">
                Zo laten
              </button>
            </form>
          </div>
        </div>
      )}

      <ul className="wm-domains">
        {DOMAINS.map((domain) => {
          const row = mandateByDomain.get(domain);
          const level = asLevel(row?.level);
          const notify = parseNotify(row?.rules);
          const stats = statsByDomain.get(domain) ?? EMPTY_WEEK_STATS;
          const heeftActiviteit = totalStats(stats) > 0;

          return (
            <li key={domain} className="wm-domain card">
              <div className="wm-domain__head">
                <h2>{DOMAIN_REGISTRY[domain].label}</h2>
                <span className="chip">{LEVEL_LABELS[level]}</span>
              </div>

              <p className="wm-domain__uitleg">
                {domainLevelText(domain, level)}
                {level === 3 && notify === "stil" ? " Stil, zonder melding." : ""}
              </p>

              {heeftActiviteit ? (
                <ul className="wm-stats">
                  <li>
                    <span className="wm-stats__n">{stats.gedaan}</span>
                    <span className="wm-stats__label">gedaan</span>
                  </li>
                  <li>
                    <span className="wm-stats__n">{stats.klaargezet}</span>
                    <span className="wm-stats__label">klaargezet</span>
                  </li>
                  <li>
                    <span className="wm-stats__n">{stats.afgewezen}</span>
                    <span className="wm-stats__label">afgewezen</span>
                  </li>
                  <li>
                    <span className="wm-stats__n">{stats.mislukt}</span>
                    <span className="wm-stats__label">mislukt</span>
                  </li>
                </ul>
              ) : (
                <p className="wm-domain__empty">Deze week is hier niets mee gebeurd.</p>
              )}

              <form action={setMandateFromForm.bind(null, domain)} className="wm-domain__form">
                <label className="sr-only" htmlFor={`niveau-${domain}`}>
                  Niveau voor {DOMAIN_REGISTRY[domain].label}
                </label>
                <select id={`niveau-${domain}`} name="level" defaultValue={level}>
                  {LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {LEVEL_LABELS[value]}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn--text"
                  type="submit"
                  aria-label={`Niveau opslaan voor ${DOMAIN_REGISTRY[domain].label}`}
                >
                  Wijzigen
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </>
  );
}

async function setMandateFromForm(domain: Domain, data: FormData) {
  "use server";
  await setMandate(domain, String(data.get("level") ?? "1"));
}

async function decideSuggestionFromForm(id: string, decision: "accept" | "dismiss") {
  "use server";
  await decideMandateSuggestion(id, decision);
}
