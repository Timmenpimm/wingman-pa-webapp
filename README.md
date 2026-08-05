# Wingman — PA web-app

Persoonlijke assistent die je échte bronnen leest (agenda, mail, bank), je dag
plant volgens één methodiek, en losse eindjes vangt die anders wegzakken.

Gebouwd op `webapp-designbriefing.md` (§1–§11 + Appendix A/B).

## Draaien

```bash
npm install
cp .env.example .env   # de standaardwaarden werken lokaal
npm run db:up          # Postgres in Docker (poort 5433)
npm run db:reset       # migraties + seed-data
npm run dev            # http://localhost:3111
```

Inloggen met `nora@voorbeeld.nl` en het wachtwoord uit `SEED_PASSWORD`.

**De ontwikkeldatabase draait lokaal in Docker en is wegwerpbaar.** De
productiedatabase hoort niet in je `.env`: die staat alleen in Vercel. Wie
lokaal tegen productie ontwikkelt, wist vroeg of laat echte gegevens met een
seed. `npm run db:nuke` gooit de lokale database weg en bouwt hem opnieuw op.

Er zijn geen API-keys nodig. De app draait volledig op seed-data uit
`prisma/seed.ts` — één verzonnen dag, inclusief een connector die stuk is,
want dat is de normale toestand van een PSD2-koppeling.

## Parallel werken

Twee mensen (of twee agents) in dezelfde map delen één werkmap, ook al hebben ze
elk een eigen branch: `git checkout` verandert de bestanden onder de ander
vandaan, en een `git add -A` sleept diens werk mee de commit in. Beide zijn hier
gebeurd.

Oplossing is één opdracht per extra werkplek:

```bash
git worktree add ../wingman-<naam> <branch>
cp .env ../wingman-<naam>/.env          # .env staat in .gitignore, dus niet mee
ln -s ../wingman-pa-webapp/node_modules ../wingman-<naam>/node_modules
```

Elke worktree heeft een eigen map, eigen branch en eigen `.next`. Draai de
dev-server dan wel op een eigen poort (`npm run dev -- -p 3112`), anders vechten
twee servers om 3111.

`git worktree list` toont wie waar zit; `git worktree remove <pad>` ruimt op.

## Testen

```bash
npm test     # eenheidstests: tijdzones, karakterbudgetten, doorsturen
npm run smoke   # tegen een draaiende app: komt niemand zonder sessie bij data?
```

De rooktest is de belangrijkste: hij loopt alle negen pagina's en alle
API-routes langs zonder sessie, controleert dat er geen byte data uit komt, en
test daarna de inlog. Draait ook tegen een deploy:

```bash
BASIS=https://… WACHTWOORD=… npm run smoke
```

Beide draaien automatisch op elke pull request (`.github/workflows/ci.yml`).

## Wat er werkt

| Scherm | Route | Staat |
|---|---|---|
| Vandaag | `/` | frog afvinken/uitstellen, prioriteiten omzetten, bevestigingen leegmaken, capture |
| Open eindjes | `/open-eindjes` | afgehandeld / herinner later / laat vallen |
| Inbox | `/inbox` | triëren naar frog, prioriteit, open eindje of weg |
| Onboarding | `/onboarding` | zeven stappen, elke koppeling geeft meteen iets terug |
| Projecten | `/projecten` | één statusregel per project |
| Week | `/week` | patronen, geen score |
| Stijlkaart | `/stijlkaart` | drie registers uit verzonden mail |
| Graaf | `/graaf` | natuurlijke vraag → kaartjes met verbindingen |
| Instellingen | `/instellingen` | permissie per bron, connector-gezondheid, dataregels |

De vier staten uit §9 (normaal, bron ontbreekt, dag 1, alles af) staan onderaan
Vandaag als schakelaar: `/?state=degraded` enzovoort.

## API

Alle mutaties lopen via `src/lib/actions.ts`; de REST-routes onder
`/api/v1` roepen exact dezelfde functies aan als de knoppen. Zo kan een
push-notificatie ("afvinken") niet uit de pas lopen met het scherm.

```
GET  /api/v1/briefing/today
POST /api/v1/briefing/confirm            { block_id, decision }
GET  /api/v1/commitments/open
POST /api/v1/commitment/{id}/done|dismiss|remind_later
POST /api/v1/graph/query                 { query }
GET  /api/v1/connectors
GET  /api/v1/connect/{provider}
GET  /api/v1/inbox · POST /api/v1/inbox  { text, source }
GET  /api/v1/style-card · POST /api/v1/style-card
POST /api/v1/webhooks/ponto-transactions
```

## Architectuur

- `src/connectors/` — adapters per bron, allemaal naar één genormaliseerd
  schema (`src/lib/types.ts`). Nieuwe bron = nieuw bestand + één regel in de
  registry. Geen wijziging aan schermen of endpoints.
- `src/brain/` — briefing-engine (stelt Vandaag samen) en de prompts. Twee
  productregels zitten hier hard in: maximaal drie prioriteiten, en een
  onvolledige briefing zegt dat zelf.
- `src/lib/graphify/` — graaf-bevraging. Nu lokaal op `GraphNode`/`GraphEdge`,
  in productie Graphify per gebruiker.
- `workers/` — Inngest-jobs (sync → extractie → graaf → coaching → push).
- `src/lib/text.ts` — de karakterbudgetten. Elk LLM-tekstslot is gebounded.

## Van dev naar productie

1. `prisma/schema.prisma`: `provider = "postgresql"`, `DATABASE_URL` naar
   Supabase/Neon in een **EU-regio** (PII, GDPR art. 9).
2. Row-level security per gebruiker aanzetten.
3. Nango koppelen (`NANGO_HOST`, `NANGO_PUBLIC_KEY`) voor OAuth-tokens van de
   overige connectors (Ponto, CalDAV, IMAP). Google/Gmail lopen niet via
   Nango — dat is `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` (zie DEPLOY.md §2b):
   "Inloggen met Google" op /inloggen doet login én connector-autorisatie in
   één stap.
4. `ANTHROPIC_API_KEY` en de Inngest-worker aanzetten.
5. Google restricted scope: CASA-assessment vóór productie; tot die tijd max
   100 testgebruikers (zie DEPLOY.md §2b).
6. Deploy naar Vercel (EU-zone) of Fly.io.

## Wat er bewust niet in zit

Geen chatvenster, geen kanban, geen dashboard met widgets, geen streaks of
scores, geen mail versturen (v1 leest alleen). Zie §2 en §7 van de briefing.
