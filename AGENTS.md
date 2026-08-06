# Wingman — OpenCode-startpunt

Dit bestand is de korte routekaart voor elke sessie. De volledige product- en
architectuurregels staan in `CLAUDE.md`; de actuele visuele waarheid staat in
`DESIGN_REFERENCE.md`. Die twee bestanden worden via `opencode.json` altijd
meegeladen.

## Werkvolgorde

1. Lees de vraag en bepaal precies welk scherm of welke laag geraakt wordt.
2. Lees alleen de relevante route, component en bestaande test(s).
3. Pas één afgebakende taak toe. Raak geen andere schermen of infrastructuur
   aan zonder expliciete opdracht.
4. Controleer met de kleinste relevante test. Voor elke TypeScript-wijziging:
   `npx tsc --noEmit`.

## Visueel werk

- De PNG uit `DESIGN_REFERENCE.md` is de visuele waarheid, niet de oudere
  groene referentie in `design-reference/Wingman-v2.dc.html`.
- Gebruik bestaande semantische klassen uit `src/app/globals.css`; voeg pas een
  componentklasse toe als het patroon op minstens twee schermen terugkomt.
- Behoud functionaliteit, server rendering en toegankelijkheid. Geen nieuwe
  dependency voor een visuele wijziging zonder noodzaak.
- Werk één scherm of component tegelijk af; eindig met wat gewijzigd en getest
  is, in maximaal vijf regels.

## Tokenzuinig werken

- Geen brede codebase-samenvatting en geen herhaling van deze regels.
- Laad geen hele pagina's of alle componenten wanneer één route voldoende is.
- Stel alleen een vraag als de keuze de productscope daadwerkelijk verandert.
