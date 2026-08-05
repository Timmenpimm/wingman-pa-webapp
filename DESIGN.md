# Design — Wingman v2

Bron: `design-reference/Wingman-v2.dc.html`. Tokens staan in
`src/app/tokens.css`, componenten in `src/app/globals.css`. Fonts komen via
`next/font/google` (`src/app/layout.tsx`) — geen CDN-link, dus geen externe
request bij elke paginalading.

Donker is het hoofdthema. Licht is de tweede variant via
`@media (prefers-color-scheme: light)` met dezelfde tokennamen.

## Kleur

| Token | Donker | Licht | Waarvoor |
|---|---|---|---|
| `--paper` | `#080a09` | `#f7f4ee` | grond |
| `--paper-raised` | `#101312` | `#fffdf9` | kaarten, rijen, velden |
| `--paper-sunk` | `#141a17` | `#f0ece3` | coachkaart, notice |
| `--ink` | `#eceae6` | `#1c1a17` | koppen |
| `--ink-body` / `--ink-muted` / `--ink-faint` | alpha 85/60/45% | vaste waarden | tekst, meta, placeholders |
| `--rule` / `--rule-strong` | alpha 9/16% | `#e2dcd1` / `#cfc7b8` | lijnen, randen |
| `--accent` | `#8ed081` | `#1f5f56` | label, link, vinkje, focus |
| `--accent-strong` | `#8ab377` | `#1f5f56` | vulling primaire knop |
| `--signal` | `#d9a441` | `#8a6a2f` | "dit vraagt aandacht" |

Twee regels die niet onderhandelbaar zijn (§3, §7):

- **Groen alleen op de primaire actie en op bevestiging.** Niet als decoratie,
  niet om een categorie aan te duiden.
- **Geen rood.** Urgentie zit in de tekst ("28 dagen open"), niet in de kleur.
  Amber is de enige tweede signaalkleur en betekent "incompleet", niet "fout".

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
| `--t-xl` | 28 | frog op mobiel |
| `--t-2xl` | 34 | frog op desktop |

## Ruimte en vorm

4px-grid: `--s-1` t/m `--s-8` (4, 8, 12, 16, 24, 32, 48, 64).
Radii: `--r-2xs` 6 (vinkvakje), `--r-sm` 12, `--r-md` 16, `--r-lg` 20,
`--r-pill` 999.
Kaarten op donker zijn vlak (`--shadow-card: none`); alleen de frog-kaart heeft
lift. Leesbreedte `--measure: 62ch`, pagina `--page-max: 40rem`.

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

Paars-blauwe AI-gradient, glow, glasmorphism, widget-dashboards met sparklines,
kanban, badges, streaks, voortgangsringen, rood/oranje/groen-codering over de
UI, iconen als vervanging van labels, chatbubbels.
