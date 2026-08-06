# Redesign-spec — ChatGPT-referentie (goedgekeurd door Martijn, 06-08-2026)

De 18 schermen in `design-reference/screens/1.png … 18.png` zijn de bron van
waarheid voor het uiterlijk. **Kijk naar je toegewezen PNG's vóór je iets
bouwt** (gewoon met Read openen — het zijn afbeeldingen). Bij twijfel wint de
PNG, niet je smaak. Functionaliteit (server actions, routes, data) blijft
zoals hij is; dit is een visuele herbouw.

## Schermindex

| PNG | Scherm | Route |
|---|---|---|
| 1 | Welkom / inloggen | /inloggen |
| 2 | Onboarding-intro "Eerst jouw ritme" (4 stappen aangekondigd) | /onboarding |
| 3 | Stap 1/4 "Wat mag minder versnipperd?" (focus-keuzekaarten) | /onboarding/[stap] |
| 4 | Stap 2/4 "Waar komt je werk binnen?" (bronnen koppelen) | /onboarding/[stap] |
| 5 | Stap 3/4 "Wanneer mag ik even aankloppen?" (drie momenten) | /onboarding/[stap] |
| 6 | Stap 4/4 "Hoe wil je klinken?" (toon kiezen) | /onboarding/[stap] |
| 7 | Klaar-scherm "Je Wingman staat naast je" (groene check-cirkel) | /onboarding/klaar |
| 8 | Vandaag (Goedemorgen, Noor) | / |
| 9 | Vandaag — degraded "Vandaag, zonder volle context" | /?state=degraded |
| 10 | Vandaag — dag 1 "Begin met één ding" | /?state=day1 |
| 11 | Avondafsluiting "Je mag stoppen" | / (avondvariant/alles-af) |
| 12 | Open eindjes | /open-eindjes |
| 13 | Inbox | /inbox |
| 14 | Projecten | /projecten |
| 15 | Week "Je week in beweging" | /week |
| 16 | Stijlkaart "Jouw stijlkaart" | /stijlkaart |
| 17 | Graaf "Waar hangt Atlas mee samen?" | /inzicht |
| 18 | Instellingen | /instellingen |

## Vormtaal (wat de vorige poging miste)

De tokens (kleuren, fonts) in `src/app/tokens.css` waren al goed:
navy `--paper`, ijsblauw `--accent`, Newsreader serif + Archivo sans.
Het verschil zit in schaal, dichtheid, kaarten en iconen:

1. **Type-schaal omlaag.** Schermtitels serif ±28–30px (1 regel), niet 48.
   De frog-titel is **sans, ±19–20px, medium** — niet serif en niet enorm.
   Alleen begroetingen/vraagzinnen ("Goedemorgen, Noor.", "Wat mag minder
   versnipperd?") zijn serif. Secties zijn overlines (11px, caps, letter-
   spacing, `--ink-muted` of `--accent-ink`).
2. **Alles is een kaart.** Lijstitems, instellingenrijen, opties in de
   onboarding: afgeronde kaarten (`--paper-raised`, 1px `--rule`, radius
   14–16px, padding 14–16px), kleine verticale gaps (10–12px). De frog-kaart
   is de enige blauwgetinte kaart (accent-soft achtergrond + accentrand).
3. **Iconen overal, dun lijnwerk.** Phosphor (regular/duotone, 1.5px gevoel):
   bron-iconen op kaarten, statusiconen, feature-iconen. In server components
   importeren uit `@phosphor-icons/react/dist/ssr`, in client components uit
   `@phosphor-icons/react`. Groot rond "feature-icoon" (onboarding/klaar):
   cirkel ±72px met radiale accent-gloed, icoon in `--accent`.
4. **Onderbalk:** zwevende afgeronde balk (radius ±20px, rand `--rule`,
   achtergrond iets lichter dan `--paper`), 4 iconen: zon (Vandaag), inbox-
   tray (Inbox), map (Projecten), tandwiel (Instellingen). Actief = `--accent`
   met zachte gloed (text-shadow/drop-shadow), inactief `--ink-faint`.
5. **Koptekst per scherm:** wordmark "wingman" (serif, klein, ±22px) links;
   rechts één klein vierkant-afgerond icoonknopje (bel op Vandaag, zie PNG's —
   per scherm kan dit een ander icoon zijn: filter, plus, terug, info). In de
   onboarding: dunne voortgangsbalkjes bovenin + "1 VAN 4" rechts.
6. **Dichtheid.** Kleinere paddings en marges dan nu; meer inhoud per
   viewport. Checkbox-rijen met dunne dividers (zie 8: prioriteiten), geen
   zwevende losse lijsten.
7. **Statusbanners compact.** Degraded-staat (9): kleine kaarten met icoon +
   amber accent, niet metersbrede tekstbanners.
8. **Knoppo's.** Primair: volle `--accent`-achtergrond, donkere tekst
   (`--accent-on-strong`), radius 12px, ±44px hoog, vaak onderin het scherm.
   Secundair: kaartknop met rand. Chipknoppen (inbox-triage: Frog /
   Prioriteit / Open eindje / Verwijder): compact, 12–13px, radius 10px.

## Spelregels voor scherm-agents

- **Blijf van gedeelde bestanden af:** `src/app/globals.css`,
  `src/app/tokens.css`, `src/components/Nav.tsx`,
  `src/components/Masthead.tsx`, `src/app/layout.tsx` zijn van de
  foundation-fase. Nodig? Gebruik de utilityklassen die daar al staan.
- **Eigen CSS in een eigen bestand:** `screen.css` naast je page
  (`import "./screen.css"` bovenin je page.tsx — mag in de App Router).
  Prefix je klassen met je schermnaam (bijv. `.oe-` voor open-eindjes).
- **Server actions, props, data-flow niet wijzigen.** Alleen presentatie.
  Dynamische tekst blijft uit de database komen; statische labels/overlines
  neem je over uit de PNG.
- **Seed-persona heet Nora; de PNG zegt "Noor"** — gebruik de echte
  gebruikersnaam uit de data, niet hardcoded "Noor".
- **NL-copy uit de PNG overnemen** waar het om vaste labels gaat
  ("DRIE PRIORITEITEN", "RUIMTE MAKEN", "Deze momenten werken", …).
  Toonregels uit CLAUDE.md blijven gelden.
- **Klaar = `npx tsc --noEmit` schoon** en je route rendert zonder
  runtime-fouten (de dev-server draait niet bij jou; de orkestrator doet de
  visuele controle).
