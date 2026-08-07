# Design — Wingman v3 (licht)

Bron: `src/app/tokens.css`, componenten in `src/app/globals.css`. Fonts komen via
`next/font/google` (`src/app/layout.tsx`) — geen CDN-link, dus geen externe
request bij elke paginalading.

Dit document is leidend voor kleur. `DESIGN_REFERENCE.md` beschrijft de
donkerblauwe Canva-verkenning die aan dit thema voorafging; die is historie,
niet een tweede waarheid. Bij twijfel over een kleurwaarde wint dit bestand,
en dus `tokens.css`.

Licht is het enige thema. Er is geen donkere variant meer: `color-scheme:
light` staat vast in `tokens.css`, en er is geen `@media
(prefers-color-scheme: dark)`-tak in `globals.css`. Eerdere versies van dit
document beschreven eerst een warm papier-zwart thema, daarna een donker
marineblauw thema — beide zijn vervangen, niet aangevuld.

## Kleur

| Token | Waarde | Waarvoor |
|---|---|---|
| `--paper` | `#f4f5f7` | grond |
| `--paper-raised` | `#ffffff` | kaarten, rijen, velden |
| `--paper-sunk` | `#eef0f4` | coachkaart, nadrukkaart, notice |
| `--ink` | `#101828` | koppen |
| `--ink-body` / `--ink-muted` / `--ink-faint` | `#475467` / `#667085` / `#98a2b3` | tekst, meta, placeholders |
| `--rule` / `--rule-strong` | alpha 8% / `#e4e7ec` | lijnen, randen |
| `--accent` | `#1b2a44` | label, link, vinkje, focus, actieve navigatie |
| `--accent-strong` | `#16233a` | vulling primaire knop |
| `--signal` | `#a15c07` | "dit vraagt aandacht" |

Twee regels die niet onderhandelbaar zijn (§3, §7):

- **Eén accent, alleen op de primaire actie en op bevestiging.** Diep
  marineblauw (`--accent-strong`), niet als decoratie, niet om een categorie
  aan te duiden. Het donkere thema gebruikte hier groen; op een lichte grond
  gaf groen geen ruimte meer voor een tweede signaalkleur die duidelijk
  anders aanvoelt dan "gelukt", dus is het accent zelf donkerblauw geworden.
- **Geen rood.** Urgentie zit in de tekst ("28 dagen open"), niet in de kleur.
  Amber is de enige tweede signaalkleur en betekent "incompleet", niet "fout".

Twee tokengroepen zijn wel gedeclareerd maar nog niet in een component
gebruikt: `--rail-*` (een donker vlak voor een toekomstige desktop-zijbalk)
en `--hero-*` (een crème verloop voor de hoofdtaakkaart). Ze staan in
`tokens.css` klaar voor wanneer die schermen gebouwd worden; tot die tijd
mag je ze noemen in ontwerp, niet in code die er al naar verwijst.

## Typografie

Newsreader (serif, 400/500) voor koppen en de frog-titel. Archivo (sans,
400/500/600/700) voor alles wat interface is. Basis 15px / 1.55.

| Token | px | Waarvoor |
|---|---|---|
| `--t-xs` | 12 | meta, bron, datum, acties in een rij |
| `--t-sm` | 14 | subtekst, secundaire knoppen |
| `--t-base` | 15 | lopende tekst |
| `--t-md` | 16 | invoer, intro, coachtekst |
| `--t-lg` | 22 | sectiekop |
| `--t-xl` | 28 | schermtitels (serif, 1 regel) |
| `--t-frog` | 28 | hoofdtaaktitel (serif, tot twee regels) |
| `--t-2xl` | 38 | gereserveerd voor uitzonderlijk grote koppen |

De hoofdtaak is de grootste tekst op het scherm, serif en tot twee regels —
niet langer een klein sans-kopje.

## Ruimte en vorm

4px-grid: `--s-1` t/m `--s-8` (4, 8, 12, 16, 24, 32, 48, 64).
Radii: `--r-2xs` 6 (vinkvakje), `--r-sm` 12, `--r-md` 16, `--r-lg` 20,
`--r-pill` 999.

Kaarten hebben nu een lichte slagschaduw (`--shadow-card`,
`--shadow-frog`), geen vlakke rand meer. Op donker deed de rand het
scheidingswerk; op een lichte grond leest een witte kaart zonder lift als een
gat. `--glow-accent` is `none` — gloed werkt alleen op een donkere grond, en
kleur draagt op licht het "dit ben jij nu"-signaal. De waarde blijft bestaan
zodat het klassecontract in `globals.css` er zonder aanpassing tegenaan kan.

Leesbreedte `--measure: 62ch`, pagina `--page-max: 40rem`.

## Karakterbudgetten

Elk tekstslot dat een LLM vult is begrensd. De budgetten staan in
`src/lib/text.ts` en gaan zowel de prompt in als door `clamp()` heen — een
model houdt zich er niet altijd aan.

| Slot | Max |
|---|---|
| frog-titel | 40 |
| frog-subregel | 140 |
| frog-implementatie | 200 |
| coachregel | 250 |
| prioriteit | 80 |
| open-eindje titel / omschrijving | 100 / 200 |
| banktransactie | 120 |
| stijlkaartregel | 160 |
| graaf-node / edge-label | 80 / 30 |
| connector-status | 120 |
| inbox-item | 280 |
| toolcall-samenvatting | 120 |

Nieuw tekstslot betekent nieuw budget. Geen uitzonderingen.

## Componenten

Het klassecontract in `globals.css` is de koppeling tussen ontwerp en app: de
pagina's gebruiken alleen deze namen, dus een volgende design-iteratie kan de
regels volledig herschrijven zonder één `.tsx` aan te raken.

Kern: `.frog` (+ `--done`), `.coach`, `.list` / `.row` (+ `__title`, `__sub`,
`__actions`, `--button`), `.check[data-checked]`, `.timeline`, `.card`,
`.chip`, `.notice` (+ `--signal`), `.empty`, `.rest`, `.btn` (`--primary`,
`--quiet`, `--text`), `.steps`, `.conn` (+ `__status[data-status]`),
`.graph-result`, `.state-switch`.

## Staten

Vandaag en Open eindjes hebben allebei vier staten (§9), te bekijken via
`/?state=empty|degraded|clear|normal`:

1. **Dag 1** — nog geen data, connectors net gekoppeld.
2. **Normaal** — gevuld.
3. **Bron ontbreekt** — eerlijk en niet-alarmerend: je moet weten dat het beeld
   incompleet is vóórdat je erop vertrouwt.
4. **Alles af** — een rustige beloning, zonder confetti.

Het verschil tussen 1 en 4 is essentieel: een leeg scherm betekent iets heel
anders als je net begonnen bent dan wanneer je net hebt opgeruimd.

## Beweging

Alleen functioneel. Een afgevinkt item mag zichtbaar verdwijnen (`.vanish`);
verder stil. `prefers-reduced-motion` zet `--dur` op 1ms.

## Niet doen

AI-gradient, glow, glasmorphism, widget-dashboards met sparklines, kanban,
badges, streaks, voortgangsringen, rood/oranje/groen-codering over de UI,
iconen als vervanging van labels, chatbubbels.
