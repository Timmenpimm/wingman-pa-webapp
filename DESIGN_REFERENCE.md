# Wingman — visuele bronkaart

## Bron en status

**Huidige bron:** de lichte schermverkenning van 7 augustus 2026, verwerkt in
`src/app/tokens.css`. Kleur is daar leidend beschreven en samengevat in
`DESIGN.md` — dit bestand herhaalt de kleurwaarden niet, om te voorkomen dat
de twee weer uit elkaar lopen. Bij een kleurvraag: `DESIGN.md`, niet hieronder.

**Vervallen:** `/Users/martijn/Downloads/Wingman webapp schermdesign
verkenning.png`, de Canva-verkenning van 6 augustus 2026. Die beschreef een
donker marineblauw thema met een hemelblauw accent (`#66B9F7`). Die richting
is één dag later vervangen door de lichte verkenning hierboven en is nu
alleen nog geschiedenis — niet gebruiken voor nieuw visueel werk. De
groene/papier-richting uit een nog eerdere versie van `DESIGN.md` was al
daarvoor vervallen. De productregels, inhoud en architectuur uit `CLAUDE.md`
zijn door beide wissels heen ongewijzigd blijven staan.

De verkenningen (donker én licht) tonen dezelfde schermenset: inloggen,
onboarding (4 stappen), klaar, Vandaag (normaal/dag 1/klaar), Open eindjes,
Inbox, Projecten, Week, Stijlkaart, Kennisbasis en Instellingen. Alle
voorbeelden zijn mobiel; desktop houdt dezelfde hiërarchie aan en krijgt
alleen meer ademruimte.

## Wat is gebleven, wat is gewisseld

De visuele richting is twee keer gewisseld (papier-zwart → marineblauw →
licht), maar de vormregels onder de kap — ritme, radii, knophoogtes,
onboarding-opbouw — zijn bij elke wissel overeind gebleven. Die staan in
"Bouwregels" hieronder en gelden voor het huidige lichte thema net zo goed
als voor de vorige twee.

Wat wél met de kleurwissel is meegegaan: de actieve navigatie en checks zijn
niet langer hemelblauw maar het donkere marineblauw-accent uit `DESIGN.md`
(`--accent`). De compacte icoonnavigatie onderaan — al onderdeel van de
marineblauwe richting — staat ongewijzigd; labels blijven daar `sr-only`
(zie `src/components/Nav.tsx`). Dit document gaat niet over componentkeuzes,
alleen over de vormregels die eronder liggen.

## Bouwregels

Deze regels zijn thema-onafhankelijk: ze golden voor het marineblauwe thema
en gelden onveranderd voor het lichte thema.

- Mobiele contentkolom: circa 342px breed met 16–18px zijruimte; grote
  kaarten en secties krijgen 16px radius, losse acties 8–10px. Komt overeen
  met `--r-md` (16) en `--r-sm` (12) in `tokens.css`.
- Elke pagina heeft bovenaan woordmerk + een kleine contextactie, en onderaan
  de vaste navigatie. Labels mogen als toegankelijke naam bestaan, maar hoeven
  niet altijd visueel onder het icoon.
- Primaire acties zijn volledig breed en 44–48px hoog. Secundaire acties zijn
  kleine, omrande knoppen in de context van hun rij of kaart.
- De frog is één prominente kaart met een kleine labelregel, een maximaal
  tweeregelige titel, één regel context en één duidelijke actie.
- Rijen zijn afzonderlijke panelen met een haarlijnrand. Vermijd grote,
  generieke kaartstapels om elke sectie heen.
- Onboarding heeft een dunne vierstaps-voortgangsbalk, steeds één vraag en één
  hoofdactie. Na een keuze volgt een rustige bevestigingsstaat, geen viering.
- Coachtekst is een zelfstandig, leesbaar blok en geen tooltip of bijschrift.
  Houd de lengte uit `src/lib/text.ts` aan.
- De UI voelt als een kalme persoonlijke cockpit, niet als een AI-dashboard:
  geen gradients, glass, grafieken, badges, confetti, streaks of alarmrood —
  zie de volledige lijst in `DESIGN.md` §Niet doen.

## Implementatievolgorde

1. Tokens, fontkeuze, app-chrome (grond, masthead, navigatie).
2. Inloggen en onboarding — hiermee vallen nieuwe ritmes het duidelijkst te
   controleren.
3. Vandaag met de vier staten.
4. Open eindjes, Inbox, Projecten, Week, Stijlkaart, Graaf en Instellingen.

Pas niet alles tegelijk aan. Houd elke stap klein, visueel controleerbaar en
functioneel volledig.
