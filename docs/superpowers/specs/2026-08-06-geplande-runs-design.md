# Geplande runs — ontwerp

**Datum:** 6 augustus 2026 · **Status:** goedgekeurd, klaar voor implementatie

## Waarom

De app kent nu één moment: een ochtendrun die nog niet eens draait. Het
werkritme dat dit product bedient heeft er drie — plannen, bijsturen,
afsluiten. Zonder die momenten is de app een scherm dat je moet onthouden te
openen, en precies dat onthouden is wat hij zou overnemen.

## Wat het niet is

Geen cron-editor. Een scherm waarin je zelf schema's samenklikt nodigt uit tot
acht runs per dag, en dan is er een meldingenfabriek gebouwd in een app die
rust belooft (§3). Drie vaste soorten, met een tijdstip dat je mag verzetten.

## De drie momenten

| Soort | Standaard | Taak | Meldt |
|---|---|---|---|
| `morning` | 08:00 | Frog kiezen, top-3 samenstellen, agenda van vandaag | altijd |
| `midday` | 12:00 | Alleen ingrijpen: is er iets binnengekomen of verschoven dat de frog achterhaalt? | alleen als er iets is |
| `evening` | 20:00 | Afvinken wat open bleef; wat onbeantwoord blijft wordt de "nog te bevestigen"-lijst van morgen | altijd |

Het middagmoment is het enige dat mag zwijgen, en dat is met opzet: een
bijsturing op een dag zonder afwijking is ruis. Zwijgen is daar het juiste
gedrag, geen ontbrekende functie.

## Datamodel

```prisma
model ScheduledRun {
  id           String    @id @default(cuid())
  user_id      String
  kind         String    // morning | midday | evening
  at           String    // "08:00", lokale tijd van de gebruiker
  days         String    @default("[1,2,3,4,5,6,7]") // JSON, ISO-weekdagen
  channel      String    @default("mail")            // mail | push | none
  enabled      Boolean   @default(true)
  last_run_on  String?   // "2026-08-06", lokale datum — de idempotentiesleutel

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@unique([user_id, kind])
  @@index([enabled])
}

model RunLog {
  id         String   @id @default(cuid())
  user_id    String
  kind       String
  ran_at     DateTime @default(now())
  local_date String
  status     String   // done | skipped | failed
  reason     String?  // waarom overgeslagen of gefaald, max 120 tekens
  notified   Boolean  @default(false)
  duration_ms Int?

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id, ran_at])
}
```

`last_run_on` als lokale datum en niet als tijdstempel: de vraag is "is dit
moment vandaag al geweest", en die vraag stel je in de kalender van de
gebruiker, niet in UTC.

## Onderdelen

- **`src/lib/runs/schedule.ts`** — puur: `isDue(run, now, timezone)`. Geen
  database, geen netwerk, dus volledig testbaar. Hier zit de zomertijd in.
- **`src/brain/runs/{morning,midday,evening}.ts`** — elk één functie
  `(tx, userId, date) => RunResult | null`. `null` betekent: niets te melden.
- **`src/lib/runs/execute.ts`** — voert één run uit binnen `withUser()`,
  schrijft `RunLog`, zet `last_run_on`, en stuurt hooguit één bericht.
- **`src/app/api/v1/runs/tick/route.ts`** — het touwtje. Bepaalt wie aan de
  beurt is en voert uit.
- **`.github/workflows/runs.yml`** — cron elke 15 minuten, roept het endpoint
  aan met een geheim.

## Uitvoerder

Een tick-endpoint met een gedeeld geheim (`RUNS_SECRET`), aangeroepen door een
GitHub Actions-cron. Reden: werkt vandaag, geen extra leverancier, en het houdt
de beslissing "wie is aan de beurt" in de app in plaats van in de planner.
Vercel Cron kan op dit plan maar één keer per dag, wat te grof is voor drie
momenten in de tijdzone van de gebruiker. Inngest is beter (herhaalpogingen,
uitwaaieren per gebruiker) en staat ook zo in Appendix A; die swap raakt straks
alleen het aanroepende deel, niet de app.

De cron loopt soms enkele minuten achter. Dat is aanvaardbaar: een briefing om
08:07 is niet minder waard. Het is wel de reden dat idempotentie op de lokale
dag zit en niet op het exacte tijdstip.

## Twee harde regels

1. **Een run zonder nieuws stuurt niets.** Anders wordt "drie momenten" binnen
   een week "drie meldingen die ik wegveeg".
2. **Eén keer per lokale dag per soort.** Een cron die twee keer vuurt of een
   herhaalpoging na een time-out mag geen tweede bericht opleveren.

Verder gelden de bestaande instellingen: stille uren, en de schakelaar "stuur
geen gevoelige details" — die laatste bepaalt of het bericht de inhoud bevat of
alleen meldt dát er iets is.

## Melden

Via mail, met de bestaande mailer. Web push staat in de briefing als primair
kanaal, maar vraagt VAPID-sleutels, een service worker en een
abonnementenmodel — een eigen brok werk. Het kanaalveld staat er al, dus dat is
later een implementatie erbij, geen verbouwing.

Zonder `AUTH_EMAIL_SERVER` verstuurt de app niets en noteert de run
`notified: false` met een reden. Eerlijk falen, niet stil.

## Falen

Een mislukte run blokkeert de andere niet: elke gebruiker en elk soort wordt
apart afgehandeld en apart gelogd. `last_run_on` wordt alleen gezet als de run
klaar is, zodat een crash de volgende tick een nieuwe poging geeft — binnen
dezelfde dag, dus zonder dubbel bericht.

## Testen

- `isDue()`: vóór het tijdstip, erna, al gedraaid vandaag, uitgezet, verkeerde
  weekdag, en de dag waarop de klok verzet wordt.
- Middagrecept geeft `null` als er niets veranderd is.
- Tick zonder geheim geeft 401; met geheim en niets te doen een lege uitslag.
- Rooktest: twee keer achter elkaar tikken levert één `RunLog` per soort.

## Wat er niet in zit

Geen zelfgemaakte soorten, geen meerdere runs per soort per dag, geen web push,
geen weekoverzicht-run. Het weekoverzicht bestaat al als scherm; er is nog geen
reden om het ook te sturen.
