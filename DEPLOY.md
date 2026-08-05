# Deploy naar Vercel

Deze app bevat persoonsgegevens onder GDPR art. 9 (schulden, gezondheid via
transacties/commitments). Deploy pas nadat elk punt hieronder is afgevinkt.

## 1. Vóór de eerste deploy

Dev draait op SQLite met seed-data en zonder keys. Productie moet Postgres in
een EU-regio zijn — dat is drie stappen, in deze volgorde:

1. **Postgres aanmaken in een EU-regio.** Supabase (Frankfurt/`eu-central-1`)
   of Neon (Frankfurt). Noteer de connectiestring
   (`postgresql://user:pass@host/db?sslmode=require`).
2. **`prisma/schema.prisma` omzetten.** Zet `provider = "sqlite"` (regel 14)
   om naar `provider = "postgresql"`. Dit bestand is bewust ongewijzigd
   gelaten in deze voorbereiding — dev moet op SQLite blijven draaien tot dit
   punt bewust gezet wordt, niet als bijwerking van een deploy-config.
3. **Migratie genereren en uitrollen.** Deze repo heeft nog geen
   `prisma/migrations/`-map — tot nu toe ging dev-schema via `prisma db push`
   (zie `package.json` → `db:push`). `prisma migrate deploy` heeft niets om
   uit te rollen zonder eerst een migratie te genereren. Dus, éénmalig, lokaal
   tegen de nieuwe Postgres-db (na stap 2, met `DATABASE_URL` naar Postgres):
   ```bash
   npx prisma migrate dev --name init
   ```
   Dit schrijft `prisma/migrations/` weg (committen!) en zet het schema in de
   nieuwe db. Bij elke volgende deploy draait `prisma migrate deploy` (niet
   `db push`) die migraties uit — zet dat als Vercel build command of in een
   `postinstall`/pre-deploy step, want het huidige `build`-script
   (`prisma generate && next build`) migreert zelf niets.
4. Zaai geen seed-data in productie — `prisma/seed.ts` is fictieve demodata
   voor dev, niet bedoeld om in een echte database te draaien.

## 2. Environment variables in Vercel

Zie `.env.example` voor de volledige lijst met uitleg per regel. Overzicht:

| Variabele | Verplicht? | Werkt niet ingevuld |
|---|---|---|
| `DATABASE_URL` | **Verplicht** | Build/boot crasht — Prisma heeft een geldige connectiestring nodig |
| `NANGO_HOST` | Optioneel | Connectors blijven "niet gekoppeld"; rest van de app werkt door |
| `NANGO_PUBLIC_KEY` | Optioneel | Zelfde als hierboven |
| `NANGO_SECRET_KEY` | Optioneel | `/api/v1/connect/callback` antwoordt 501 i.p.v. tokens te accepteren |
| `GOOGLE_WEBHOOK_TOKEN` | Optioneel | Google-calendar-webhook antwoordt 501 |
| `PONTO_WEBHOOK_SECRET` | Optioneel | Ponto-transactie-webhook antwoordt 501 |

Alleen `DATABASE_URL` is dus een harde eis. De rest is functionaliteit die de
app zelf gracefully uitschakelt zonder key (geen crash, zie ook README §"Van
dev naar productie" voor de volgorde waarin je die later aanzet: Nango eerst,
dan de webhooks).

Vars die in eerdere versies van `.env.example` stonden maar door geen code
worden gelezen (`NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY`, `GRAPHIFY_API_KEY`,
`NEXTAUTH_SECRET`, `NEXTAUTH_URL`) zijn eruit gehaald — ze deden niets. Ze
horen bij functionaliteit die er nog niet is (zie §4 en README): pas
toevoegen zodra de bijbehorende code er ook is, anders staat er ruis in de
Vercel-project-settings.

## 3. Deployment protection aanzetten

De app mag niet publiek bereikbaar zijn — noch production, noch previews,
want beide serveren echte of demo-persoonsgegevens. Vercel biedt dit gratis
via **Vercel Authentication** (project-instelling "Deployment Protection"):
bezoekers zonder toegang tot het Vercel-team krijgen een login-scherm i.p.v.
de app te zien.

Aanzetten, één van drie manieren:

- **Dashboard:** Project → Settings → Deployment Protection → "Vercel
  Authentication" → scope instellen op alle deployments (production +
  previews).
- **CLI:**
  ```bash
  vercel project protection enable <project-naam> --sso
  ```
- **REST API** (`PATCH` op de project-settings):
  ```json
  { "ssoProtection": { "deploymentType": "all" } }
  ```
  (`deploymentType` mag ook `"prod_deployment_urls_and_all_previews"` of
  `"preview"` zijn — voor deze app: `"all"`.)

Losstaand hiervan bestaat **Password Protection** (los wachtwoord i.p.v.
Vercel-login), maar dat vereist een betaald plan (`--password`-flag,
"Requires an eligible plan" volgens de Vercel-docs). Vercel Authentication is
kosteloos en dekt de eis "niet publiek toegankelijk" — gebruik die, tenzij er
een reden is om niet-teamleden zonder Vercel-account toegang te geven via een
gedeeld wachtwoord.

## 4. Wat niet werkt op Vercel serverless

`workers/morning-scan.ts` is de Inngest-job die 's ochtends sync → extractie →
graaf → coaching → push draait (zie de comments bovenin het bestand). Dat
moet **niet** als Vercel serverless function draaien:

- Vercel functions zijn request-driven met een timeout (max enkele minuten,
  ook op betaalde plans); een ochtend-run over alle connectors van alle
  gebruikers is een lange, stateful batch-job, geen HTTP-request-response.
- Er is geen cron-scheduler in dit project die serverless functions op tijd
  aanroept zonder een aparte queue/orchestrator (Inngest zelf, of Vercel Cron
  + een queue) — en zelfs met Vercel Cron loop je tegen dezelfde
  functietijdslimiet aan zodra er meerdere gebruikers zijn.
- De functie gooit op dit moment sowieso een `Error` ("Worker nog niet
  aangesloten") — hij is nog niet aangesloten op een runtime, dus dit is nu
  nog theoretisch, maar blijft relevant zodra hij wél wordt aangesloten.

Kortom: de Next.js-app (dit project) kan naar Vercel; de Inngest-worker hoort
bij Inngest zelf (of een andere always-on/queue-gebaseerde runtime) te draaien
zodra hij wordt geïmplementeerd, niet als API-route in deze app.

## 5. Checklist vóór livegang

- [ ] Postgres in EU-regio aangemaakt, `provider` in `prisma/schema.prisma`
      staat op `postgresql`, `prisma migrate deploy` is succesvol gedraaid
      tegen die database (niet `db push`, niet de seed-data)
- [ ] `DATABASE_URL` in Vercel gezet naar die Postgres-db; build (`npm run
      build`) is groen op Vercel
- [ ] Deployment Protection (Vercel Authentication, scope "all") staat aan —
      geverifieerd door de production-URL uitgelogd te openen en een
      login-scherm te zien
- [ ] Row-level security per gebruiker staat aan op de Postgres-kant (zie
      README §"Van dev naar productie", punt 2 — niet iets wat deze
      deploy-config regelt)
- [ ] Geen enkele `.env`/secret in git — alleen `.env.example` met placeholders
      is gecommit


---

## Zoals het nu draait (5 augustus 2026)

- **Repo → Vercel is gekoppeld.** Productie-branch is `main`; een push deployt
  automatisch.
- **Database:** Supabase `eu-west-1` (Ierland), Vercel-regio `dub1` — zelfde
  regio, dus geen zeeoverschrijding per query. Migratiehistorie staat in
  `prisma/migrations/`.
- **Afgeschermd met echte inlog**: e-mailadres + wachtwoord (bcrypt, kosten 12),
  sessie via Auth.js v5 met JWT-cookie. Zie `auth.ts` en `src/middleware.ts`.

### Hoe de poort werkt

`src/middleware.ts` is de enige toegangspoort en weigert standaard:

- geen sessie + pagina → redirect naar `/inloggen`
- geen sessie + `/api/v1/*` → `401` JSON, geen redirect (een `fetch` kan geen
  redirect naar een HTML-inlogscherm volgen)
- vrij: `/inloggen`, `/api/auth/*` en statische assets

Tweede laag: `currentUserId()` gooit een fout zonder sessie. Er is geen stille
terugval op een demo-gebruiker — dat zou hetzelfde lek zijn, één laag dieper.

Vercel Authentication wordt **niet** meer gebruikt: die dekt op dit plan alleen
deployment-URL's, niet het productiedomein. Het oude gedeelde wachtwoord
(`ACCESS_PASSWORD`) is vervallen.

### Verplichte env-vars in productie

| Variabele | Waarvoor |
|---|---|
| `DATABASE_URL` | runtime, transaction pooler (6543) |
| `DIRECT_URL` | migraties, session pooler (5432) |
| `AUTH_SECRET` | ondertekent de sessiecookie — zonder dit werkt inloggen niet |

Optioneel: `AUTH_EMAIL_SERVER` + `AUTH_EMAIL_FROM` voor de inloglink. Zonder die
twee blijft de knop staan maar meldt hij eerlijk dat mailen nog niet is
ingesteld. `SEED_PASSWORD` gebruikt de seed om het demo-account een wachtwoord
te geven; laat je hem leeg, dan genereert de seed er één en print die eenmalig.

### Scheiding tussen gebruikers

Staat nu op twee plekken: in de queries én in de database.

De app verbindt als `app_user` — een rol zonder `BYPASSRLS`. Elke tabel heeft
`FORCE ROW LEVEL SECURITY` en één policy die `user_id` vergelijkt met
`current_setting('app.user_id')`. Die waarde wordt per transactie gezet door
`withUser()` (`src/lib/db/with-user.ts`), met `set_config(..., true)` — dus
LOCAL. Dat laatste is geen detail: op de transaction pooler wordt dezelfde
verbinding voor een volgende request hergebruikt, en een waarde met
sessie-scope zou daar blijven hangen.

Eén uitzondering: het inlogpad zoekt een gebruiker op vóórdat er een sessie
is, en gebruikt daarvoor de eigenaarsrol (`src/lib/db/owner-prisma.ts`). Dat
pad leest alleen e-mail en wachtwoord-hash om te bepalen wíé iemand is; alles
daarna loopt via `app_user`.

`npm run rls:bewijs` toont aan dat het werkt: gebruiker A krijgt B's rijen niet,
ook niet met een expliciete `where` op B's id, en kan niets namens B wegschrijven.
Dat draait ook in CI.

### Nieuwe omgeving opzetten

De migratie maakt de rol `app_user` aan maar zet geen wachtwoord — dat hoort
niet in git. Dus eenmalig per omgeving:

```sql
ALTER ROLE app_user WITH PASSWORD '<genereer iets langs>';
```

Zet daarna `DATABASE_URL` naar `app_user` en `DIRECT_URL` naar de eigenaarsrol.

### Wat er nog niet is

Geen registratie: accounts ontstaan alleen via de seed.
