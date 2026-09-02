# SYSTEM.md — Wingman PA-webapp

> Werkingskaart. Eerst lezen bij elke taak in deze repo, vóór PROGRESS.md en vóór je code opent.
> Verkennen van de codebase alleen als dit bestand de vraag niet beantwoordt — en dan is dat een signaal dat dit bestand moet worden aangevuld.
> Max ±120 regels. Bijwerken in dezelfde PR als elke wijziging aan onderdelen, datastroom, sleutelbestanden, omgevingen, cron of valkuilen.

Laatst bijgewerkt: 2026-09-02 · commit `0ee84d5`

## 1. Wat het doet
Persoonlijke assistent die échte bronnen van één gebruiker leest (agenda, mail, bank) en de dag plant volgens één methodiek: één frog en maximaal drie prioriteiten per dag, losse eindjes gevangen. Server-rendered Next.js-webapp in het Nederlands; de uitvoer is een dagelijkse briefing plus meldingen (push/mail), en zelfstandig handelen binnen een per-domein mandaat. Gebouwd op de productbriefing (../webapp-designbriefing.md, buiten deze repo — zie `CLAUDE.md`); v1 verstuurt bewust geen mail.

## 2. Onderdelen
| Onderdeel | Pad | Draait op | Doet |
|---|---|---|---|
| Webapp (schermen + REST) | `src/app/` | Vercel | Schermen; routegroep `(app)` zit achter `gateOnboarding()`; /api/v1-routes roepen dezelfde acties aan als de knoppen |
| Brein (briefing, recepten) | `src/brain/` | de tick | Stelt Vandaag samen, schrijft frog/prioriteiten/coachtekst in de run; geen LLM tijdens een page load |
| Geplande runs | `src/lib/runs/` | tick /api/v1/runs/tick | Bepaalt in de tijdzone van de gebruiker welke recepten (ochtend/middag/avond) aan de beurt zijn; sync → extractie → escalatie → vertrouwensloop → voorstellen → recepten |
| Connectors | `src/connectors/` | tick + webhooks | Google-agenda, Gmail, Ponto, CalDAV/IMAP; normaliseren naar Event/Email/Transaction; tools hangen aan de adapter |
| Toollaag + poort | `src/lib/tools/` | app | Elke actie bij een bron: `gate()` (mandaat × effect) → doen, vragen of weigeren; elke poging wordt een `ToolCall`-rij |
| Mandaatmodel | `src/lib/mandates/` | app | Negen domeinen op drie niveaus; vertrouwensloop stelt promoveren voor, mislukking degradeert terug |
| Escalatie | `src/lib/escalation/` | tick | Vier detectoren die buiten het briefingritme mogen storen; dedupe via `EscalationEvent` |
| Graaf | `src/lib/graphify/` | pagina | Inzicht-scherm bevraagt de graaf van nodes/edges |
| Database + seed | `prisma/` | Supabase / lokaal Docker | Postgres-schema met RLS per gebruiker; `prisma/seed.ts` is één verzonnen dag (dev) |
| Cron | `.github/workflows/runs.yml` | GitHub Actions | Trekt elke 15 min aan de tick (met `x-runs-secret`); de app bepaalt zelf wie aan de beurt is |

## 3. Datastroom
```
koppelen (onboarding / "Inloggen met Google") -> connector-rij + mandaat-rij in Postgres
bronnen -> src/connectors/ (adapter fetchDelta of webhook) -> Event/Email/Transaction  # genormaliseerd, RLS per gebruiker
cron elke 15 min -> POST /api/v1/runs/tick -> src/lib/runs/execute.ts
  -> sync eerst -> commitment-extractie (LLM, zonder ANTHROPIC_API_KEY stil overgeslagen)
  -> escalatiedetectie -> vertrouwensloop -> voorstelmotor -> recepten
  -> DailyBriefing + RunLog -> bericht (web-push, anders mail); geen nieuws = "overgeslagen", niets verstuurd
Vandaag-scherm -> briefing-engine (leest alleen) -> frog, max 3 prioriteiten, degraded-rijen
knop / REST / voorstel -> src/lib/actions.ts -> requestTool() (tools/execute.ts) -> gate()
  -> ToolCall-rij vóór de aanroep (pending = er wacht een "ja") -> adapter -> afloop + log
```
Schrijven heeft één route: alle mutaties staan in `src/lib/actions.ts`, REST en knoppen roepen dezelfde functies aan.

## 4. Sleutelbestanden (max 10)
| Bestand | Waarom je hier moet zijn |
|---|---|
| `src/lib/mandates/domains.ts` | Domeinregister (9 domeinen), niveaus 1–3, defaults; geen `Mandate`-rij = niveau 1, de voorzichtigste stand |
| `src/lib/tools/permission.ts` | De permissiepoort `gate()`: matrix niveau × effect (read/draft/write) → doen/vragen/weigeren, puur en testbaar |
| `src/lib/tools/execute.ts` | Uitvoerder: ToolCall-rij vóór de aanroep, goedkeuring, dedupe, degradeert niveau 3→2 na een autonome mislukking |
| `src/lib/tools/registry.ts` | Toolcatalogus afgeleid uit de adapters; `assertNoMailSending()` (regel 5: v1 verstuurt geen mail) |
| `src/brain/propose.ts` | Voorstelmotor: dagcap, werkuren, `dedupeKey` — nooit zelf een mandaatbeslissing |
| `src/lib/escalation/triggers.ts` | Detectoren: deadline_24h, money_unexpected, children, housing_longterm (laatste twee via `UserSetting`) |
| `src/brain/briefing-engine.ts` | `MAX_PRIORITIES` (3); een kapotte connector komt als `degraded` mee, nooit stil een half beeld |
| `src/lib/runs/schedule.ts` | Wie aan de beurt is in de tijdzone van de gebruiker; één run per soort per lokale dag |
| `src/lib/db/with-user.ts` | Zet `app.user_id` per transactie (LOCAL) zodat RLS op de pooler werkt; `src/lib/db/owner-prisma.ts` alleen voor inlog en systeemwerk |
| `prisma/schema.prisma` | Datamodel; arrays als JSON-string, geen `String[]`; RLS-policies in `prisma/migrations/` |

## 5. Omgevingen en koppelingen
- Live: onbekend (niet uit repo af te leiden; DEPLOY.md: gekoppeld aan Vercel, productie-branch `main`) · Staging/demo: geen
- Database: Postgres op Supabase, eu-west-1 (naam onbekend, niet uit repo af te leiden) · Migraties: `prisma/migrations/`, bij deploy uitgerold door `scripts/migrate-bij-deploy.mjs`
- Dev-database: Postgres 15 in Docker op poort 5433, wegwerpbaar (`npm run db:up` / `db:reset` / `db:nuke`); CI draait een `postgres:15-alpine`-service
- Cron: GitHub Actions `.github/workflows/runs.yml`, elke 15 min `POST /api/v1/runs/tick`; URL uit vars `APP_URL`, geheim uit secrets `RUNS_SECRET` (waarden onbekend, niet uit repo af te leiden)
- Externe koppelingen: Nango (OAuth-tokenbeheer; Google/Gmail lopen sinds kort via "Inloggen met Google" in plaats van Nango) · Google (agenda/gmail, restricted scopes, CASA vóór productie) · Ponto (bank, PSD2-webhook) · Anthropic (coachtekst en extractie) · web-push (VAPID) · SMTP via nodemailer (inloglink)
- Secrets: lokaal .env (gitignored); productie als env-vars in Vercel (verplicht: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`; zie `DEPLOY.md` §2). Namen: `NANGO_HOST`/`NANGO_PUBLIC_KEY`/`NANGO_SECRET_KEY`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `GOOGLE_WEBHOOK_TOKEN`, `PONTO_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, `AUTH_EMAIL_SERVER`/`AUTH_EMAIL_FROM`, `SEED_PASSWORD`. Nooit waarden in dit bestand

## 6. Verifiëren dat het werkt
```
npm run db:reset && npm run dev        # app op http://localhost:3111, inlog met nora@voorbeeld.nl
curl -X POST -H "x-runs-secret: $RUNS_SECRET" http://localhost:3111/api/v1/runs/tick   # JSON-uitslag; ochtendrun schrijft DailyBriefing
npm test                               # eenheidstests groen
npm run smoke                          # tegen draaiende app: geen byte data zonder sessie
node scripts/rls-bewijs.mjs            # gebruiker A ziet B's rijen niet
```

## 7. Valkuilen (max 5)
- RLS geldt alleen als de app draait als rol `app_user` (zonder BYPASSRLS). Lokaal/CI die rol eerst aanmaken vóór `prisma migrate deploy`, anders test je alles op de eigenaarsrol en lijkt RLS te werken terwijl het dat niet doet.
- Supabase-pooler: de rol heet `app_user.<project-ref>` in de connectiestring; zonder die suffix krijg je `FATAL: no tenant identifier provided`, die eruitziet als "database onbereikbaar".
- `DATABASE_URL` = transaction pooler (runtime), `DIRECT_URL` = session pooler (migraties). Migraties over de transaction pooler mislukken; `scripts/migrate-bij-deploy.mjs` draait alleen bij `VERCEL_ENV=production`.
- Arrays staan als JSON-string in het veld (niet `String[]`) — bewust uit de SQLite-tijd; queries en seed moeten parsen/stringifiën.
- De werkmap wordt gedeeld door parallelle werkers: werk in een eigen git-worktree met eigen poort (`npm run dev -- -p 3112`) en eigen .env-kopie; `git add -A` sleept andermans werk mee (README "Parallel werken").

## 8. Waar meer staat
- Productbriefing en productregels: `CLAUDE.md` (bron van waarheid) · Werkafspraken per sessie: `AGENTS.md`
- Deploy-afspraken: `DEPLOY.md` · Kleur/tokens: `DESIGN.md` · Visuele waarheid: `DESIGN_REFERENCE.md`
- Designs/afspraken achteraf: `docs/superpowers/specs/` · Vervallen: `design-reference/` en de donkere verkenning (zie `DESIGN_REFERENCE.md`)
- Voortgang/roadmap: geen PROGRESS.md in deze repo; in deze repo geldt SYSTEM.md als eerste leesstap
