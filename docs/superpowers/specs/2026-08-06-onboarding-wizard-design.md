# Onboarding als wizard — ontwerp

**Datum:** 6 augustus 2026 · **Status:** geïmplementeerd

## Waarom

Het oude `/onboarding` was één scherm met zeven stappen, en het klopte op vier
punten niet:

1. **De knoppen waren dood.** "Agenda koppelen" wees naar
   `/api/v1/connect/google`, en die route geeft voor google en gmail altijd
   501 terug — sinds de Google-provider in `auth.ts` staat, loopt die
   autorisatie niet meer via Nango. Je kreeg dus rauwe JSON in beeld.
2. **De payoff was verzonnen.** "Ik zie drie vaste blokken per week, gym op
   maandag" stond hardgecodeerd in de pagina. Dat verscheen ook bij een lege
   agenda — precies het vertrouwen dat je op dat moment probeert te winnen.
3. **Zeven stappen tegelijk**, terwijl het scherm zelf "één bron tegelijk"
   beloofde. Drie ervan (installeren, Telegram, permissies) stonden permanent
   op niet-gedaan en deden niets.
4. **Geen einde.** Er was geen staat "onboarding klaar", dus geen afsluitend
   scherm, geen hervatten na afhaken, en geen antwoord op de enige vraag die
   iemand na het koppelen heeft: en nu?

## Wat het wordt

Een wizard van vier stappen, één bron per scherm: **agenda → mail → bank →
meldingen**, met een slotscherm op `/onboarding/klaar`.

Elke stap heeft dezelfde opbouw, en die volgorde is het hele idee:

> koppelen → meteen zien wat ik in die bron vind → dán pas de vraag wat ik
> ermee mag.

De permissievraag stond eerder als losse stap achteraan. Daar gaat hij over
niets: je hebt op dat moment nog nooit gezien wat de app met je mail dóét. In
de stap zelf komt hij op het moment dat het bewijs voor je staat.

## Voortgang zonder teller

Er wordt geen stapnummer bijgehouden. `deriveSteps()` leidt de staat af uit wat
er ís:

| Staat | Wanneer |
|---|---|
| `connected` | er is een Connector-rij voor deze stap met een status ≠ `not_connected` |
| `confirmed` | met de hand afgevinkt (alleen meldingen: "hij staat erop") |
| `skipped` | bewust overgeslagen — `UserSetting["onboarding:<stap>"] = "skipped"` |
| `todo` | de rest |

`/onboarding` is daardoor geen scherm maar een wissel naar de eerste stap die
nog `todo` is. Hervatten na afhaken werkt daarmee gratis, en een teller die uit
de pas loopt met de bronnen die er echt zijn kan niet bestaan.

Een connector in `error` of `reauth_required` telt als gekoppeld. De koppeling
is gelegd; dat hij hapert meldt de briefing zelf (regel 2). Iemand opnieuw door
de onboarding sturen is daar het verkeerde antwoord op.

## Eerlijk over wat er niet is

- **Payoff komt uit de tabellen**, nooit uit een vaste zin. Staat er niets, dan
  wijst het scherm vooruit: "Start met koppelen van je accounts." Er is nog geen
  sync die `fetchDelta` aanroept, dus dat is voorlopig de normale tekst. Eerder
  stond daar een uitleg wáárom het leeg was; dat klopt, maar het is een excuus
  op de plek waar de gebruiker vooruit wil.
- **Geen knop die 501 teruggeeft.** Google loopt via `signIn("google")` (agenda
  én mail in één consentscherm), Ponto via Nango. Staat een van beide niet aan
  in deze omgeving, dan staat er een "nog niet"-melding in plaats van een knop.
- **Overslaan mag overal.** Ook bij de agenda, hoe verplicht die inhoudelijk
  ook is. Een wizard waar je niet uit komt als je geen Google gebruikt is erger
  dan een lege Vandaag.
- **De bank vraagt geen permissie.** Alleen lezen (§6.7); een keuzemenu dat
  toch niets mag doen belooft iets dat niet bestaat.

## De permissievraag

Vier radio's, geen keuzemenu: de gradiënt uit §6.7 beantwoord je niet uit vier
losse woorden, dus staat er per optie bij wat het voor díé bron betekent
("Ik zet het concept klaar in Gmail. Versturen doe jij.").

Eén stap kan meer dan één connector bevatten — een gekoppelde Google-account
levert al gauw een werk- én een privéagenda op, met verschillende rechten. De
vraag wordt één keer gesteld en geldt voor beide; het scherm zegt dat dan ook
("Geldt voor Agenda — werk en Agenda — privé"). De voorselectie is de
**voorzichtigste** van de bestaande waarden: wie op Volgende drukt zonder te
kiezen, hoort niets weg te geven dat hij nog niet had gegeven.

## De poort

Wie nog nooit een bron heeft gekoppeld of overgeslagen, landde na het inloggen
op Vandaag: een lege briefing met zes navigatie-ingangen naar schermen die
allemaal niets te melden hebben. Nu is het andersom — zolang er niets besloten
is, ís de wizard het scherm.

De poort staat in het layout van route-groep `(app)`, niet in elke pagina
apart: een nieuw scherm is daarmee automatisch gedekt in plaats van dat iemand
eraan moet denken. Buiten de groep staan `/inloggen` (je moet erin kunnen),
`/onboarding` (anders stuurt de poort zichzelf in een kringetje) en `/api` (die
geeft JSON, geen redirect naar een scherm). Middleware kan dit niet doen: die
draait in de Edge-runtime en komt niet bij Prisma.

Hij gaat open zodra er íéts besloten is, ook als dat "overslaan" was — niet pas
als de onboarding helemaal af is. Iemand die de bank bewust laat liggen mag
daar niet bij elk scherm opnieuw naartoe geduwd worden. Wie de reeks niet
uitliep ziet op Vandaag één regel ("Onaf — afmaken"), en die verdwijnt zodra je
op "Naar vandaag" hebt gedrukt.

De navigatie blijft zichtbaar tijdens de wizard. Verbergen zou hem netter maken,
maar sluit ook iemand op die er vrijwillig heen liep en er weer uit wil.

## Wat er niet in zit

- **Geen eerste import.** De payoff wacht op de sync die er nog niet is.
- **Geen Telegram, geen CalDAV/IMAP-koppelscherm.** Beide bestaan nog niet als
  werkende flow, dus staan ze niet als stap in de wizard.

## Bestanden

| Bestand | Rol |
|---|---|
| `src/lib/onboarding/steps.ts` | de stapdefinities en alle afleiding — puur, dus getest zonder database |
| `src/lib/onboarding/status.ts` | leest connectors, markeringen en de payoff in één transactie |
| `src/app/onboarding/page.tsx` | de wissel naar de eerste openstaande stap |
| `src/app/onboarding/[stap]/page.tsx` | het stapscherm |
| `src/app/onboarding/klaar/page.tsx` | het slot: wanneer je het eerste resultaat ziet |
| `src/app/onboarding/Trail.tsx` | het spoor bovenaan |
| `src/lib/actions.ts` | `connectGoogle`, `continueOnboarding`, `finishOnboarding` |
| `src/lib/onboarding/gate.ts` | de poort |
| `src/app/(app)/layout.tsx` | de route-groep waar de poort voor geldt |
