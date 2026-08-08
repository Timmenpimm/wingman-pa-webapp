import { dateKeyToUtc, localDateKey, localDayRange } from "@/lib/day";
import { ownerPrisma } from "@/lib/db/owner-prisma";
import { withUser } from "@/lib/db/with-user";
import { planProposals, type Proposal, type ProposalInput } from "@/brain/propose";
import { requestTool } from "@/lib/tools/execute";

/**
 * De voorstelmotor aan de praat houden: per gebruiker de stand lezen, laten
 * plannen (src/brain/propose.ts is puur), en elk voorstel door de
 * permissiepoort duwen.
 *
 * Waarom dit een eigen stap in de tick is en niet iets binnen het
 * ochtendrecept:
 *
 * - Recepten draaien ín een `withUser`-transactie; `requestTool` opent er zelf
 *   één (en doet er een netwerkaanroep tussen). Dat nesten is precies wat
 *   src/lib/tools/execute.ts in zijn kop uitlegt dat je niet moet doen.
 * - Voorstellen horen niet aan het ritme vast te zitten. Een mail die om elf
 *   uur binnenkomt hoeft niet tot morgenochtend te wachten op een concept, net
 *   zomin als de escalatielaag op de briefing wacht.
 *
 * Wat er gebeurt met een voorstel hangt af van het mandaat, niet van dit
 * bestand: niveau 3 voert het uit, niveau 2 zet het klaar ter goedkeuring,
 * niveau 1 vraagt het per keer. Dit bestand kent die niveaus niet eens.
 */

export interface VoorstelUitslag {
  gebruikers: number;
  voorgesteld: number;
  klaargezet: number;
  uitgevoerd: number;
}

/** Hoeveel dedupe-sleutels we teruglezen. Ruim boven de dagcap × een jaar. */
const MAX_DEDUPE_KEYS = 500;

export async function voorstellenVoorAlleGebruikers(now: Date): Promise<VoorstelUitslag> {
  // Systeemwerk over alle gebruikers heen — zelfde reden als bij de sync- en
  // escalatiestap: dit is geen verzoek namens één ingelogde gebruiker.
  const gebruikers = await ownerPrisma.user.findMany({ select: { id: true, timezone: true } });

  const uitslag: VoorstelUitslag = {
    gebruikers: gebruikers.length,
    voorgesteld: 0,
    klaargezet: 0,
    uitgevoerd: 0,
  };

  for (const gebruiker of gebruikers) {
    try {
      const invoer = await leesStand(gebruiker.id, gebruiker.timezone, now);
      const voorstellen = planProposals(invoer);
      if (voorstellen.length === 0) continue;

      for (const voorstel of voorstellen) {
        const status = await doeVoorstel(gebruiker.id, voorstel);
        if (status === "pending") uitslag.klaargezet += 1;
        if (status === "done") uitslag.uitgevoerd += 1;
        if (status !== "overgeslagen") uitslag.voorgesteld += 1;
      }
    } catch {
      // Eén gebruiker met een kapotte stand mag de rest van de tick niet
      // blokkeren — volgende tick opnieuw. Er is niets weggeschreven dat een
      // tweede poging in de weg staat.
      continue;
    }
  }

  return uitslag;
}

/**
 * Eén voorstel aanbieden. Alles wat misgaat wordt hier opgeslokt: een bron die
 * niet gekoppeld is, een mandaat dat het weigert, een voorstel dat er al
 * stond. Geen van die drie is een storing die de gebruiker moet zien, en geen
 * van drieën mag het volgende voorstel tegenhouden.
 *
 * De mislukkingen die er wél toe doen — een aanroep die bij de bron
 * stukliep — staan al in ToolCall; dat is het logboek, niet dit.
 */
async function doeVoorstel(
  userId: string,
  voorstel: Proposal,
): Promise<"pending" | "done" | "overgeslagen"> {
  try {
    const uitkomst = await requestTool(userId, voorstel.tool, voorstel.params, {
      origin: "wingman",
      dedupeKey: voorstel.dedupeKey,
    });
    return uitkomst.status === "pending" ? "pending" : uitkomst.status === "done" ? "done" : "overgeslagen";
  } catch {
    return "overgeslagen";
  }
}

/** De stand van vandaag, in één transactie, precies wat de planner nodig heeft. */
async function leesStand(
  userId: string,
  timezone: string,
  now: Date,
): Promise<ProposalInput> {
  const localDate = localDateKey(timezone, now);
  const dag = localDayRange(timezone, now);

  return withUser(userId, async (tx) => {
    const [briefing, events, commitments, sleutels, vandaagGedaan] = await Promise.all([
      tx.dailyBriefing.findFirst({
        where: { user_id: userId, date: dateKeyToUtc(localDate) },
        select: { frog_title: true, frog_status: true },
      }),
      tx.event.findMany({
        where: { user_id: userId, start_at: { gte: dag.start, lt: dag.end } },
        orderBy: { start_at: "asc" },
        select: { title: true, start_at: true, end_at: true },
      }),
      tx.commitment.findMany({
        where: { user_id: userId, status: "open", direction: "i_owe" },
        orderBy: { opened_at: "asc" },
        select: {
          id: true,
          what: true,
          party: true,
          party_contact: true,
          source: true,
          opened_at: true,
        },
      }),
      tx.toolCall.findMany({
        where: { user_id: userId, dedupe_key: { not: null } },
        orderBy: { created_at: "desc" },
        take: MAX_DEDUPE_KEYS,
        select: { dedupe_key: true },
      }),
      // De dagcap telt op wandkloktijd, niet op de datumsleutel: "vandaag" is
      // hier het venster waarin de gebruiker leeft.
      tx.toolCall.count({
        where: { user_id: userId, origin: "wingman", created_at: { gte: dag.start } },
      }),
    ]);

    return {
      localDate,
      timezone,
      now,
      frog: briefing ? { title: briefing.frog_title, status: briefing.frog_status } : null,
      events,
      commitments,
      usedDedupeKeys: new Set(
        sleutels.map((s) => s.dedupe_key).filter((k): k is string => k !== null),
      ),
      proposalsToday: vandaagGedaan,
    };
  });
}
