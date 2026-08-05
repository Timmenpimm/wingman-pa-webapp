/**
 * Seed: één dag uit een verzonnen leven.
 *
 * Dit is dev- en demofixture, geen gebruikersdata. Echte gebruikers krijgen
 * hun eigen inhoud uit hun eigen connectors; er staat daarom bewust niets in
 * deze repo dat naar een echt persoon te herleiden is — ook niet in de
 * git-historie.
 *
 * Het persona is Nora Vermeer, zelfstandig ontwerper. Haar dag is zo gekozen
 * dat elke staat uit §9 te zien is: een frog die vastzit, draden van 6 tot 28
 * dagen oud, een transactie zonder categorie, en een bankkoppeling waarvan de
 * toestemming bijna verloopt.
 *
 * Geen lorem en geen Engels: NL-strings zijn 15–25% langer, en als je daar niet
 * mee ontwerpt klopt er bij livegang niets meer (§5). Alle teksten passen
 * binnen de budgetten uit src/lib/text.ts. Alles is relatief aan vandaag, zodat
 * "26 dagen stil" morgen 27 zegt.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const today = new Date();
today.setHours(0, 0, 0, 0);

const at = (h: number, m = 0) => {
  const d = new Date(today);
  d.setHours(h, m, 0, 0);
  return d;
};
const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(today.getTime() + n * 86_400_000);

async function main() {
  await prisma.$transaction([
    prisma.graphEdge.deleteMany(),
    prisma.graphNode.deleteMany(),
    prisma.dailyBriefing.deleteMany(),
    prisma.commitment.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.email.deleteMany(),
    prisma.event.deleteMany(),
    prisma.inboxItem.deleteMany(),
    prisma.styleCard.deleteMany(),
    prisma.person.deleteMany(),
    prisma.project.deleteMany(),
    prisma.connector.deleteMany(),
    prisma.userSetting.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const user = await prisma.user.create({
    data: {
      email: "nora@voorbeeld.nl",
      name: "Nora Vermeer",
      timezone: "Europe/Amsterdam",
      locale: "nl",
    },
  });
  const uid = user.id;

  /* ---------- Connectors -------------------------------------------- */
  // Eén connector staat bewust op reauth_required: de degraded-staat (§9.3) is
  // geen randgeval maar de normale toestand van elk PSD2-koppelvlak.
  await prisma.connector.createMany({
    data: [
      {
        user_id: uid,
        provider: "google",
        type: "calendar",
        label: "Agenda — werk",
        account_id: "nora@voorbeeld.nl",
        access_token: "demo",
        status: "active",
        permission: "act_and_report",
        scopes: JSON.stringify(["calendar.events"]),
        last_sync_at: at(7, 32),
      },
      {
        user_id: uid,
        provider: "caldav",
        type: "calendar",
        label: "Agenda — privé",
        account_id: "nora.prive@voorbeeld.nl",
        access_token: "demo",
        status: "active",
        permission: "propose",
        scopes: JSON.stringify(["calendar.readonly"]),
        last_sync_at: at(7, 32),
      },
      {
        user_id: uid,
        provider: "gmail",
        type: "mail",
        label: "Mail — studio",
        account_id: "nora@voorbeeld.nl",
        access_token: "demo",
        status: "active",
        permission: "draft",
        scopes: JSON.stringify(["gmail.readonly"]),
        last_sync_at: at(7, 34),
      },
      {
        user_id: uid,
        provider: "ponto",
        type: "bank",
        label: "Bank via Ponto",
        account_id: "acc_demo",
        access_token: "demo",
        status: "reauth_required",
        permission: "propose",
        scopes: JSON.stringify(["ai:read"]),
        consent_expires_at: daysAhead(6),
        last_sync_at: daysAgo(2),
        error_message:
          "PSD2-toestemming verloopt over 6 dagen. Transacties van gisteren en vandaag ontbreken.",
      },
      {
        user_id: uid,
        provider: "telegram",
        type: "chat",
        label: "Telegram",
        account_id: "-",
        status: "not_connected",
        permission: "silent",
      },
    ],
  });

  /* ---------- Agenda vandaag ---------------------------------------- */
  await prisma.event.createMany({
    data: [
      {
        user_id: uid,
        external_id: "demo:zomerlab",
        title: "Zomerlab — workshopmiddag",
        start_at: at(13),
        end_at: at(17),
        location: "Werkplaats Noord",
      },
      {
        user_id: uid,
        external_id: "demo:verzekeraar",
        title: "Bellen: verzekeraar over openstaande claim",
        start_at: at(10),
        end_at: at(10, 20),
      },
      {
        user_id: uid,
        external_id: "demo:sam",
        title: "Sam — drukproef affiches",
        start_at: at(11, 30),
        end_at: at(12),
        meeting_url: "https://meet.voorbeeld.nl/sam",
      },
      {
        user_id: uid,
        external_id: "demo:avond1",
        title: "Eten met Deniz",
        start_at: at(19),
        end_at: at(20),
        is_private: true,
      },
      {
        user_id: uid,
        external_id: "demo:avond2",
        title: "Zwemmen",
        start_at: at(19),
        end_at: at(20, 15),
        is_private: true,
      },
    ],
  });

  /* ---------- Projecten --------------------------------------------- */
  const zomerlab = await prisma.project.create({
    data: {
      user_id: uid,
      name: "Zomerlab",
      status: "active",
      status_line: "loopt · wo+za 13–17u t/m 15/9 · open: tweede begeleider, 10 partnermails",
    },
  });
  const podcast = await prisma.project.create({
    data: {
      user_id: uid,
      name: "Podcast met Iris",
      status: "active",
      status_line: "concept met Iris · pilot = drie afleveringen · wacht op reactie opzet",
    },
  });
  const verhuizing = await prisma.project.create({
    data: {
      user_id: uid,
      name: "Nieuwe werkplek",
      status: "active",
      status_line: "tijdelijk onderdak · zoekt ruimte voor minstens een jaar",
    },
  });
  await prisma.project.create({
    data: {
      user_id: uid,
      name: "Ledenplatform",
      status: "on_hold",
      status_line: "met Joep · opzet staat · niets open deze week",
    },
  });

  /* ---------- Mensen ------------------------------------------------- */
  await prisma.person.createMany({
    data: [
      {
        user_id: uid,
        name: "Sam de Vries",
        emails: JSON.stringify(["sam@voorbeeld.nl"]),
        organizations: JSON.stringify(["Drukkerij Meridiaan"]),
        roles: JSON.stringify(["opdrachtgever"]),
        frequency_score: 0.82,
        last_contact_at: daysAgo(3),
      },
      {
        user_id: uid,
        name: "Iris Molenaar",
        emails: JSON.stringify(["iris@voorbeeld.nl"]),
        roles: JSON.stringify(["podcast-partner"]),
        frequency_score: 0.44,
        last_contact_at: daysAgo(28),
      },
      {
        user_id: uid,
        name: "Joep Aarts",
        emails: JSON.stringify(["joep@voorbeeld.nl"]),
        organizations: JSON.stringify(["Werkplaats Noord"]),
        roles: JSON.stringify(["partner Zomerlab"]),
        frequency_score: 0.71,
        last_contact_at: daysAgo(1),
      },
      {
        user_id: uid,
        name: "Deniz",
        emails: JSON.stringify([]),
        roles: JSON.stringify(["vriend"]),
        frequency_score: 0.3,
        last_contact_at: daysAgo(26),
      },
    ],
  });

  /* ---------- Open eindjes ------------------------------------------ */
  await prisma.commitment.createMany({
    data: [
      {
        user_id: uid,
        source: "chat",
        source_ref: "demo:deniz",
        source_label: "chat 10/7",
        direction: "they_owe",
        party: "Deniz",
        what: "Opties voor nieuwe afspraak",
        context: "Jij stuurde drie datums, daarna is het stil gebleven.",
        opened_at: daysAgo(26),
        confidence: 0.91,
      },
      {
        user_id: uid,
        source: "email",
        source_ref: "demo:iris:opzet",
        source_label: "mail 8/7",
        direction: "i_owe",
        party: "Iris",
        what: "Reactie op opzet van de pilot",
        context: "Iris vroeg om feedback op de drie afleveringen.",
        opened_at: daysAgo(28),
        project_id: podcast.id,
        confidence: 0.95,
      },
      {
        user_id: uid,
        source: "email",
        source_ref: "demo:factuur",
        source_label: "mail 22/7",
        direction: "they_owe",
        party: "Drukkerij Meridiaan",
        what: "Bevestiging factuur juli",
        context: "Factuur verstuurd, geen ontvangstbevestiging.",
        opened_at: daysAgo(14),
        confidence: 0.72,
      },
      {
        user_id: uid,
        source: "calendar",
        source_ref: "demo:begeleider",
        source_label: "agenda 29/7",
        direction: "i_owe",
        party: "Werkplaats Noord",
        what: "Tweede begeleider regelen voor zaterdag",
        context: "Zaterdagblok staat nog met één persoon ingepland.",
        due_date: daysAhead(2),
        opened_at: daysAgo(7),
        project_id: zomerlab.id,
        confidence: 0.88,
      },
      {
        user_id: uid,
        source: "inference",
        source_ref: "demo:werkplek",
        source_label: "afgeleid uit agenda",
        direction: "i_owe",
        party: "Jezelf",
        what: "Verhuurders mailen over een vaste ruimte",
        context: "Blok hiervoor stond zestien dagen achter elkaar in de agenda.",
        opened_at: daysAgo(16),
        project_id: verhuizing.id,
        confidence: 0.64,
      },
      {
        user_id: uid,
        source: "email",
        source_ref: "demo:btw",
        source_label: "mail 30/7",
        direction: "they_owe",
        party: "Boekhouder",
        what: "Overzicht btw tweede kwartaal",
        context: "Gevraagd voor de aangifte; nog niets terug.",
        opened_at: daysAgo(6),
        confidence: 0.8,
      },
    ],
  });

  /* ---------- Bank --------------------------------------------------- */
  await prisma.transaction.createMany({
    data: [
      {
        user_id: uid,
        external_id: "demo:tx1",
        account_iban: "NL00BANK0123456789",
        account_name: "Betaalrekening",
        amount: 2450,
        booked_at: daysAgo(3),
        counterparty: "Drukkerij Meridiaan",
        description: "Factuur juli — affichereeks",
        category: "inkomsten",
        category_confidence: 0.96,
        transaction_type: "transfer",
        project_id: zomerlab.id,
      },
      {
        user_id: uid,
        external_id: "demo:tx2",
        account_iban: "NL00BANK0123456789",
        account_name: "Betaalrekening",
        amount: -1275,
        booked_at: daysAgo(4),
        counterparty: "Verhuur Werkplaats Noord",
        description: "Maandtermijn augustus",
        category: "vaste lasten",
        category_confidence: 0.93,
        transaction_type: "standing_order",
      },
      {
        user_id: uid,
        external_id: "demo:tx3",
        account_iban: "NL00BANK0123456789",
        account_name: "Betaalrekening",
        amount: -187.5,
        booked_at: daysAgo(2),
        counterparty: "Zorgverzekeraar",
        description: "Maandpremie",
        category: "zorg",
        category_confidence: 0.89,
        transaction_type: "direct_debit",
      },
      {
        user_id: uid,
        external_id: "demo:tx4",
        account_iban: "NL00BANK0123456789",
        account_name: "Betaalrekening",
        amount: -64.9,
        booked_at: daysAgo(1),
        counterparty: "KBLT B.V.",
        description: "Incasso zonder omschrijving",
        needs_review: true,
        category_confidence: 0.21,
        transaction_type: "direct_debit",
      },
      {
        user_id: uid,
        external_id: "demo:tx5",
        account_iban: "NL00BANK0123456789",
        account_name: "Betaalrekening",
        amount: -420,
        booked_at: daysAgo(5),
        counterparty: "Belastingdienst",
        description: "Aanslag — termijn 3",
        category: "belasting",
        category_confidence: 0.97,
        transaction_type: "direct_debit",
      },
    ],
  });

  /* ---------- Briefing vandaag --------------------------------------- */
  await prisma.dailyBriefing.create({
    data: {
      user_id: uid,
      date: today,
      frog_title: "Verzekeraar bellen over de claim",
      frog_sub:
        "Vandaag 10:00 · vraag alleen: is de melding van 9/7 in behandeling en wanneer volgt een besluit? 15 min.",
      frog_implement: "Bel vóór het Zomerlab-blok. Dossiernummer staat in de mail van 9/7.",
      frog_status: "open",
      coach_text:
        "De melding ligt er sinds 9 juli en niemand bevestigde iets. Daardoor groeit een lijst 'nog te bevestigen' die niemand afsluit — dezelfde mechaniek die de werkplek-taak zestien dagen liet doorschuiven.",
      priorities: JSON.stringify([
        { id: "p1", text: "Tweede begeleider regelen voor zaterdag", done: false },
        { id: "p2", text: "Reactie sturen op de opzet van Iris", done: false },
        { id: "p3", text: "Banktoestemming vernieuwen", done: false },
      ]),
      confirmations: JSON.stringify([
        { id: "c1", text: "Premie is afgeschreven — klopt dat bedrag?", answered: false },
        { id: "c2", text: "Gisteren geblokt voor verhuurders: is dat gelukt?", answered: false },
        { id: "c3", text: "Zomerlab zaterdag: staat de tweede begeleider rond?", answered: false },
      ]),
      degraded: JSON.stringify(["ponto"]),
    },
  });

  /* ---------- Inbox --------------------------------------------------- */
  await prisma.inboxItem.createMany({
    data: [
      { user_id: uid, text: "Joep vragen of de affiches al bij de drukker liggen", source: "siri" },
      { user_id: uid, text: "Agendatip nabellen — redactie zei deze week", source: "capture" },
      {
        user_id: uid,
        text: "Idee: Zomerlab-zaterdag samen met de bibliotheek",
        source: "capture",
      },
    ],
  });

  /* ---------- Stijlkaart ---------------------------------------------- */
  await prisma.styleCard.createMany({
    data: [
      {
        user_id: uid,
        register: "bekenden",
        greeting: "Hoi [naam],",
        signoff: "Groet, Nora",
        avg_words: 48,
        typical: JSON.stringify([
          "Even kort:",
          "Laat maar weten wat je handig vindt.",
          "Ik pak het op.",
        ]),
      },
      {
        user_id: uid,
        register: "zakelijk_eerste_contact",
        greeting: "Beste [naam],",
        signoff: "Met vriendelijke groet,\nNora Vermeer — Studio Vermeer",
        avg_words: 132,
        typical: JSON.stringify([
          "Ik neem contact op naar aanleiding van",
          "Concreet stel ik voor:",
          "Ik hoor graag of dit aansluit.",
        ]),
      },
      {
        user_id: uid,
        register: "instanties",
        greeting: "Geachte heer/mevrouw,",
        signoff: "Met vriendelijke groet,\nN. Vermeer",
        avg_words: 96,
        typical: JSON.stringify([
          "Op [datum] heb ik een melding gedaan onder kenmerk",
          "Mijn vraag is uitsluitend of",
          "Graag verneem ik binnen twee weken.",
        ]),
      },
    ],
  });

  /* ---------- Graaf ---------------------------------------------------- */
  const nodes = [
    { id: "n:person:sam", type: "Person", label: "Sam de Vries", cluster: "werk" },
    { id: "n:person:iris", type: "Person", label: "Iris Molenaar", cluster: "projecten" },
    { id: "n:person:joep", type: "Person", label: "Joep Aarts", cluster: "zomerlab" },
    { id: "n:person:deniz", type: "Person", label: "Deniz", cluster: "privé" },
    { id: "n:project:zomerlab", type: "Project", label: "Zomerlab", cluster: "zomerlab" },
    { id: "n:project:podcast", type: "Project", label: "Podcast met Iris", cluster: "projecten" },
    { id: "n:project:werkplek", type: "Project", label: "Nieuwe werkplek", cluster: "privé" },
    { id: "n:org:meridiaan", type: "Organization", label: "Drukkerij Meridiaan", cluster: "werk" },
    { id: "n:org:werkplaats", type: "Organization", label: "Werkplaats Noord", cluster: "zomerlab" },
    { id: "n:account:bank", type: "Account", label: "Betaalrekening", cluster: "geld" },
    {
      id: "n:tx:premie",
      type: "Transaction",
      label: "Zorgverzekeraar — maandpremie €187,50",
      summary: "maandelijkse incasso, categorie zorg",
      cluster: "geld",
    },
    {
      id: "n:tx:onbekend",
      type: "Transaction",
      label: "KBLT B.V. — €64,90 zonder omschrijving",
      summary: "geen categorie gevonden, vraagt controle",
      cluster: "geld",
    },
    {
      id: "n:tx:belasting",
      type: "Transaction",
      label: "Belastingdienst — aanslag termijn 3",
      cluster: "geld",
    },
    {
      id: "n:tx:factuur",
      type: "Transaction",
      label: "Drukkerij Meridiaan — factuur juli €2.450",
      summary: "inkomsten, hangt aan het Zomerlab-budget",
      cluster: "geld",
    },
    {
      id: "n:commitment:iris",
      type: "Commitment",
      label: "Reactie op opzet van Iris",
      summary: "28 dagen open",
      cluster: "projecten",
    },
    {
      id: "n:commitment:begeleider",
      type: "Commitment",
      label: "Tweede begeleider regelen",
      summary: "7 dagen open, deadline over 2 dagen",
      cluster: "zomerlab",
    },
    { id: "n:category:zorg", type: "Category", label: "zorg", cluster: "geld" },
  ];
  await prisma.graphNode.createMany({
    data: nodes.map((n) => ({ ...n, user_id: uid })),
  });

  await prisma.graphEdge.createMany({
    data: [
      { user_id: uid, from_id: "n:commitment:iris", to_id: "n:person:iris", type: "OWES", label: "jij aan Iris" },
      { user_id: uid, from_id: "n:commitment:iris", to_id: "n:project:podcast", type: "PART_OF" },
      { user_id: uid, from_id: "n:commitment:begeleider", to_id: "n:project:zomerlab", type: "PART_OF" },
      { user_id: uid, from_id: "n:person:joep", to_id: "n:project:zomerlab", type: "PART_OF" },
      { user_id: uid, from_id: "n:person:sam", to_id: "n:org:meridiaan", type: "PART_OF" },
      { user_id: uid, from_id: "n:org:werkplaats", to_id: "n:project:zomerlab", type: "MENTIONS", label: "locatie" },
      { user_id: uid, from_id: "n:account:bank", to_id: "n:tx:premie", type: "HAS_TRANSACTION" },
      { user_id: uid, from_id: "n:account:bank", to_id: "n:tx:onbekend", type: "HAS_TRANSACTION" },
      { user_id: uid, from_id: "n:account:bank", to_id: "n:tx:belasting", type: "HAS_TRANSACTION" },
      { user_id: uid, from_id: "n:account:bank", to_id: "n:tx:factuur", type: "HAS_TRANSACTION" },
      { user_id: uid, from_id: "n:tx:premie", to_id: "n:category:zorg", type: "CATEGORIZED_AS" },
      { user_id: uid, from_id: "n:tx:factuur", to_id: "n:project:zomerlab", type: "PART_OF", label: "budget" },
      { user_id: uid, from_id: "n:tx:factuur", to_id: "n:org:meridiaan", type: "MENTIONS", label: "opdrachtgever" },
      { user_id: uid, from_id: "n:project:zomerlab", to_id: "n:commitment:begeleider", type: "NEXT_ACTION" },
      { user_id: uid, from_id: "n:project:podcast", to_id: "n:commitment:iris", type: "NEXT_ACTION" },
      { user_id: uid, from_id: "n:person:deniz", to_id: "n:project:werkplek", type: "MENTIONS", label: "losse draad" },
    ],
  });

  await prisma.userSetting.createMany({
    data: [
      { user_id: uid, key: "quiet_hours", value: "22:00-07:00" },
      { user_id: uid, key: "sensitive_in_push", value: "false" },
      { user_id: uid, key: "channel", value: "push+mail" },
    ],
  });

  console.log("Seed klaar voor", user.email, "(fictief demo-persona)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
