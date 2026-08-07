import type { ConnectorType, Provider } from "@/lib/types";
import type { StepId, StepMark } from "@/lib/onboarding/steps";
import { CONNECTOR_CATALOG } from "./index";

/**
 * Wat er nog bij kan — de catalogus zoals Instellingen hem toont (§6.7).
 *
 * De onboarding was tot nu toe de enige plek waar je een bron kon toevoegen.
 * Wie de bank daar oversloeg, kwam er nooit meer langs: Instellingen laat
 * alleen Connector-rijen zien die er al zíjn. Deze functie draait dat om en
 * zet de catalogus naast wat je hebt.
 *
 * Puur, zodat de regel "geen knop die 501 teruggeeft" te testen is zonder
 * database of sessie. De omgeving komt als twee vlaggen binnen in plaats van
 * als process.env: een koppeling die in dev niet aanstaat, moet dat zeggen —
 * niet doen alsof.
 */

export type CatalogState = "connected" | "available" | "unavailable";

export interface CatalogRow {
  provider: Provider;
  type: ConnectorType;
  label: string;
  state: CatalogState;
  /** Wat deze bron doet, of waarom hij nog niet kan. Eén zin. */
  note: string;
  /** Bewust overgeslagen tijdens de kennismaking. */
  skipped: boolean;
  /**
   * Hoe je hem koppelt. Google loopt via de NextAuth-provider, Ponto via een
   * redirect. Ontbreekt dit, dan is er geen weg naar buiten en hoort er dus
   * ook geen knop te staan.
   */
  connect?: { kind: "google" } | { kind: "link"; href: string };
}

/** Bij welke onboardingstap een bron hoort — voor "overgeslagen". */
const STEP_OF: Partial<Record<Provider, StepId>> = {
  google: "agenda",
  caldav: "agenda",
  gmail: "mail",
  imap: "mail",
  ponto: "bank",
};

/** Wat de bron voor je doet. Bij "unavailable" staat er waarom het niet kan. */
const NOTE: Partial<Record<Provider, string>> = {
  google: "Je afspraken van vandaag en de week vooruit.",
  gmail: "Wie op jou wacht en waar jij op wacht. Ik lees mee, ik verstuur niets.",
  ponto: "Eén flow voor alle Europese banken. Alleen lezen; de toestemming verloopt na 90 dagen.",
  caldav: "Apple, Fastmail en Nextcloud kan ik lezen, maar koppelen kan nog niet.",
  imap: "Een andere mailbox dan Gmail kan ik lezen, maar koppelen kan nog niet.",
  telegram: "Berichten meelezen kan nog niet.",
};

const GEEN_OMGEVING = "Staat in deze omgeving nog niet aan.";

export function catalogRows(input: {
  /** Providers met een Connector-rij die niet `not_connected` is. */
  connected: string[];
  marks: Partial<Record<StepId, StepMark>>;
  /** AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET staan gezet. */
  googleConfigured: boolean;
  /** De Nango-URL voor Ponto, of null als die ontbreekt. */
  pontoUrl: string | null;
}): CatalogRow[] {
  return CONNECTOR_CATALOG.map((entry) => {
    const step = STEP_OF[entry.provider];
    const skipped = step ? input.marks[step] === "skipped" : false;

    if (input.connected.includes(entry.provider)) {
      return {
        provider: entry.provider,
        type: entry.type,
        label: entry.label,
        state: "connected",
        note: NOTE[entry.provider] ?? "",
        skipped: false,
      };
    }

    const connect = connectRoute(entry.provider, input);
    // Een bron zonder route is niet "kapot" maar "nog niet af": zeg welke van
    // de twee het is, want daar kan de een wél iets aan doen en de ander niet.
    const note = connect
      ? (NOTE[entry.provider] ?? "")
      : bouwbaar(entry.provider)
        ? GEEN_OMGEVING
        : (NOTE[entry.provider] ?? "");

    return {
      provider: entry.provider,
      type: entry.type,
      label: entry.label,
      state: connect ? "available" : "unavailable",
      note,
      skipped,
      ...(connect ? { connect } : {}),
    };
  });
}

/** Providers waarvoor een koppelroute bestáát — die alleen config missen. */
function bouwbaar(provider: Provider): boolean {
  return provider === "google" || provider === "gmail" || provider === "ponto";
}

function connectRoute(
  provider: Provider,
  env: { googleConfigured: boolean; pontoUrl: string | null },
): CatalogRow["connect"] {
  if (provider === "google" || provider === "gmail") {
    return env.googleConfigured ? { kind: "google" } : undefined;
  }
  if (provider === "ponto") {
    return env.pontoUrl ? { kind: "link", href: "/api/v1/connect/ponto" } : undefined;
  }
  // CalDAV, IMAP en Telegram hebben wel een adapter of een plek in de
  // catalogus, maar geen autorisatieflow. Zie src/connectors/generic.ts.
  return undefined;
}

/** Alleen wat je nog kúnt toevoegen — gekoppelde bronnen staan al bij Bronnen. */
export function addableRows(rows: CatalogRow[]): CatalogRow[] {
  return rows.filter((r) => r.state !== "connected");
}
