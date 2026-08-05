# Wingman — werkafspraken voor deze repo

Bron van waarheid voor het product: `../webapp-designbriefing.md` (§1–§11 +
Appendix A/B). Wijkt code daarvan af, dan wint de briefing — tenzij hier
expliciet iets anders staat.

## Productregels die geen mening zijn

Deze staan in code afgedwongen, niet in een review-checklist:

1. **Maximaal drie prioriteiten zichtbaar**, ook als er twintig open staan.
   `MAX_PRIORITIES` in `src/brain/briefing-engine.ts`. Ook de inbox-triage houdt
   zich eraan.
2. **Een onvolledige briefing zegt dat zelf.** Een connector in `error` of
   `reauth_required` komt als `degraded` mee in de response. Nooit stil een half
   beeld tonen.
3. **Elk LLM-tekstslot is gebounded.** Budgetten staan in `src/lib/text.ts` en
   gaan zowel de prompt in als door `clamp()` heen. Nieuw tekstslot = nieuw
   budget, geen uitzonderingen.
4. **"Laat vallen" is even makkelijk als "afgehandeld".** Geen bevestigingsvraag,
   geen prullenbak. Een lijst die alleen kan groeien wordt genegeerd.
5. **v1 verstuurt geen mail.** De mail-adapters hebben bewust geen `send()`.

## Toon

Nederlands, kort, direct. Geen uitroeptekens, geen emoji als aanmoediging, geen
bullets in coachtekst. Benoem het patroon, niet het symptoom. De lezer opent dit
scherm vaak op een slecht moment — streng mag in de inhoud, niet in de kleur.

Schrijf UI-teksten met NL-strings in gedachten: die zijn 15–25% langer dan
Engelse. Ontwerp en test dus met de echte tekst.

## Architectuur

- **Adapters praten nooit rechtstreeks met de UI.** Elke bron normaliseert naar
  `src/lib/types.ts` en registreert zich in `src/connectors/index.ts`. Een nieuwe
  bron toevoegen mag geen enkel scherm of endpoint raken.
- **Eén gedrag, twee ingangen.** Alle mutaties staan in `src/lib/actions.ts`; de
  REST-routes roepen dezelfde functies aan als de knoppen. Nooit logica
  dupliceren in een route handler.
- **Geen LLM-calls tijdens een page load.** Tekst wordt in de nachtelijke run
  geschreven en opgeslagen; schermen lezen alleen.
- **Server-rendered, werkt zonder client-JS.** Formulieren met server actions.
  Client components alleen waar interactie het echt vereist.
- **Geen chatvenster, geen kanban, geen widget-dashboard, geen streaks of
  scores.** Zie de anti-slop-lijst in §7.

## Privacy

Schulden, gezondheid en uitkering vallen onder GDPR art. 9. Data blijft per
gebruiker gescheiden, EU-gehost, versleuteld; er wordt niet op getraind. Tokens
gaan nooit door een API-response. Gevoelige details staan standaard niet in
notificaties.

## Dev

```bash
npm run db:reset   # schema + seed
npm run dev        # :3111
npx tsc --noEmit   # moet schoon zijn vóór commit
```

Dev draait op SQLite en seed-data, zonder API-keys. Productie is Postgres
(Supabase/Neon, EU-regio) — alleen de `provider` in `prisma/schema.prisma` en
`DATABASE_URL` verschillen. Daarom staan er geen `String[]`-kolommen in het
schema; arrays gaan als JSON-string het veld in.

## Git

Nooit rechtstreeks naar `main`: branch → commit → PR → merge.
