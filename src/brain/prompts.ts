import { BUDGET } from "@/lib/text";

/**
 * De prompts zijn productontwerp, geen implementatiedetail (§4).
 *
 * Model-tiering conform Appendix A: Haiku voor extractie/classificatie (veel,
 * goedkoop, feitelijk), Sonnet voor het coach-oordeel (weinig, duur, toon).
 * Budgetten gaan mee de prompt in; de UI kapt daarna alsnog af.
 */

export const MODELS = {
  extract: "claude-haiku-4-5-20251001",
  coach: "claude-sonnet-5",
} as const;

/** Toonregels — dit is de stem van het merk, niet een stijlvoorkeur. */
export const VOICE = `
Je schrijft als een rustige, directe Nederlandse coach.
- Kort. Geen opsmuk, geen bullets, geen uitroeptekens, geen emoji.
- Benoem het patroon, niet het symptoom. "Dit schuift nu 16 dagen door — dat is
  geen tijdgebrek" is goed. "Vergeet niet je taak af te maken!" is fout.
- Nooit bestraffend, nooit aanmoedigend-hol. Streng mag in de inhoud zitten,
  niet in de opmaak.
- Nooit schuld of schaamte aanspreken. De lezer opent dit scherm vaak op een
  slecht moment.
`.trim();

export function coachPrompt(input: {
  openCommitments: Array<{ what: string; party: string; days: number; direction: string }>;
  todayEvents: Array<{ title: string; start: string }>;
  yesterdayUnanswered: string[];
  patterns: string[];
}): string {
  return `
${VOICE}

Je krijgt de stand van vandaag. Schrijf drie dingen, in JSON:

1. "frog_title" — de ene taak van vandaag. Max ${BUDGET.frogTitle} tekens.
   Werkwoord vooraan, concreet genoeg om te doen zonder na te denken.
2. "frog_sub" — wanneer, wat precies, hoe lang. Max ${BUDGET.frogSub} tekens.
3. "coach_text" — 2 tot 4 regels over de dag. Max ${BUDGET.coach} tekens.
   Wat je opvalt, niet wat er moet. Als er een patroon zichtbaar is over
   meerdere items heen, benoem dat patroon.

Kies de frog uit wat écht vastzit, niet uit wat het makkelijkst is.

Stand:
- Open beloftes: ${JSON.stringify(input.openCommitments)}
- Agenda vandaag: ${JSON.stringify(input.todayEvents)}
- Gisteren onbeantwoord: ${JSON.stringify(input.yesterdayUnanswered)}
- Gesignaleerde patronen: ${JSON.stringify(input.patterns)}

Antwoord alleen met JSON: {"frog_title","frog_sub","coach_text"}.
`.trim();
}

export function extractCommitmentsPrompt(email: {
  subject: string;
  from: string;
  body: string;
  is_sent: boolean;
}): string {
  return `
Lees deze mail en bepaal of er een openstaande belofte in zit.

Drie uitkomsten:
- "i_owe": de gebruiker heeft iets toegezegd of moet reageren.
- "they_owe": de gebruiker heeft iets gevraagd en wacht op antwoord.
- "none": geen belofte. Nieuwsbrieven, bevestigingen, ruis.

Wees streng. Een vraagteken is nog geen belofte. Bij twijfel: "none" met een
lage confidence. Liever een gemist item dan een lijst die volloopt met ruis —
een lijst die alleen groeit wordt genegeerd.

Van: ${email.from}
Onderwerp: ${email.subject}
Verzonden door gebruiker: ${email.is_sent}
Tekst:
${email.body.slice(0, 4000)}

Antwoord met JSON: {"direction","party","what","context","due_date","confidence"}.
"what" is max ${BUDGET.looseEndTitle} tekens, "context" max ${BUDGET.looseEndDescription}.
`.trim();
}

export function categorizeTransactionPrompt(tx: {
  counterparty?: string;
  description?: string;
  amount: number;
}): string {
  return `
Categoriseer deze banktransactie en bepaal of hij actie vraagt.

Categorieën: inkomsten, vaste lasten, belasting, zorg, boodschappen,
schuld/aflossing, zakelijk, overig.

Zet "needs_review" op true als de categorie onduidelijk is of als er iets aan
opvalt (onbekende tegenpartij, dubbele afschrijving, incasso die niet past bij
een lopend abonnement).

Transactie: ${JSON.stringify(tx)}

Antwoord met JSON: {"category","confidence","needs_review","note"}.
"note" is max ${BUDGET.transaction} tekens en beschrijft alleen wát opvalt.
`.trim();
}
