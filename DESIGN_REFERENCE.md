# Wingman — visuele bronkaart

## Bron en status

**Leidende visuele referentie:**
`/Users/martijn/Downloads/Wingman webapp schermdesign verkenning.png`

Canva-verkenning, 6 augustus 2026. Dit bestand vervangt voor nieuw visueel
werk de groene/papier-richting uit `DESIGN.md` en
`design-reference/Wingman-v2.dc.html`. De productregels, inhoud en
architectuur uit `CLAUDE.md` blijven ongewijzigd leidend.

De verkenning toont: inloggen, onboarding (4 stappen), klaar, Vandaag
(normaal/dag 1/klaar), Open eindjes, Inbox, Projecten, Week, Stijlkaart,
Kennisbasis en Instellingen. Alle voorbeelden zijn mobiel; desktop moet
dezelfde hiërarchie behouden en alleen meer ademruimte krijgen.

## Visuele richting

- Donker marineblauw als basis, nooit zwart of warm papier.
- Eén helder hemelblauw accent voor de primaire knop, actieve staat, focus,
  checks en geselecteerde navigatie. Geen groen als algemeen actieaccent.
- Oppervlakken zijn vlak en gelaagd: grond → paneel → nadrukkaart. Dunne,
  koele blauwe randen doen het scheidingswerk; nauwelijks schaduw.
- Koppen zijn compact, hoogcontrast serif; interface, labels en data zijn
  helder sans-serif. Het wordmark is klein en serif.
- Grote, rustige titelblokken; kleine uppercase labels met ruime tracking;
  meta-informatie blijft gedempt.
- De UI voelt als een kalme persoonlijke cockpit, niet als een AI-dashboard:
  geen gradients, glass, grafieken, badges, confetti, streaks of alarmrood.

## Afgeleide tokens

Dit zijn werkwaarden, afgeleid uit de PNG. Verifieer ze visueel tijdens de
eerste implementatie; behandel ze niet als een merkhandboek met absolute
hex-waarheid.

| Rol | Richtwaarde |
| --- | --- |
| grond | `#071321` |
| verhoogd paneel | `#0B1B30` |
| nadrukkaart | `#102B48` |
| rand | `#244765` |
| koptekst | `#E9F3FC` |
| gewone tekst | `#A8BDD0` |
| gedempte tekst | `#6E849B` |
| accent / primaire knop | `#66B9F7` |
| accent-op-tekst | `#062039` |
| ingetogen waarschuwing | gedempte amber, alleen voor incomplete bron |

## Bouwregels

- Mobiele contentkolom: circa 342px breed met 16–18px zijruimte; grote
  kaarten en secties krijgen 16px radius, losse acties 8–10px.
- Elke pagina heeft bovenaan woordmerk + een kleine contextactie, en onderaan
  de vaste iconische navigatie. Labels mogen als toegankelijke naam bestaan,
  maar hoeven niet altijd visueel onder het icoon.
- De actieve navigatie gebruikt blauw; inactieve iconen zijn koel gedempt.
- Primaire acties zijn volledig breed, 44–48px hoog en helder blauw. Secundaire
  acties zijn kleine, omrande knoppen in de context van hun rij of kaart.
- De frog is één prominente blauwe kaart met een kleine labelregel, een
  maximaal tweeregelige titel, één regel context en één duidelijke actie.
- Rijen zijn afzonderlijke donkerblauwe panelen met een haarlijnrand. Vermijd
  grote, generieke kaartstapels om elke sectie heen.
- Onboarding heeft een dunne vierstaps-voortgangsbalk, steeds één vraag en één
  hoofdactie. Na een keuze volgt een rustige bevestigingsstaat, geen viering.
- De dag-1 en klaartoestanden krijgen een enkele blauwe/groene gloedcirkel als
  inhoudelijk anker; geen decoratieve gloed elders.
- Coachtekst is een zelfstandig, leesbaar blok en geen tooltip of bijschrift.
  Houd de lengte uit `src/lib/text.ts` aan.

## Expliciete verschillen met de oude implementatie

| Oud | Nu |
| --- | --- |
| groen `#8ed081` als primaire actie | helder blauw als primaire actie |
| warm zwart/papier en groene frog | donker marineblauw en blauwe frog |
| tekstnavigatie onderaan | compacte icoonnavigatie onderaan |
| brede desktop-achtige pagina als uitgangspunt | mobile-first telefoonritme als uitgangspunt |
| oude HTML-referentie | de Canva-PNG hierboven |

## Implementatievolgorde

1. Tokens, fontkeuze, app-chrome (grond, masthead, bottom navigation).
2. Inloggen en onboarding — hiermee vallen de nieuwe ritmes het duidelijkst
   te controleren.
3. Vandaag met de vier staten.
4. Open eindjes, Inbox, Projecten, Week, Stijlkaart, Graaf en Instellingen.

Pas niet alles tegelijk aan. Houd elke stap klein, visueel controleerbaar en
functioneel volledig.
