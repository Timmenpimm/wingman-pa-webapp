/**
 * Zet je Google OAuth-sleutels in .env, zonder ze in je shell-geschiedenis.
 *
 *   npm run google:sleutels
 *
 * Waarom een script en niet even zelf plakken: een secret die je in een
 * terminal-commando typt (`echo AUTH_GOOGLE_SECRET=… >> .env`) staat daarna in
 * ~/.zsh_history en blijft daar maanden liggen. Dit leest van stdin, echoot de
 * secret niet, en zet .env daarna op 600.
 *
 * Waar de sleutels vandaan komen staat in DEPLOY.md §2b — kort:
 * console.cloud.google.com/apis/credentials → OAuth client ID → Web application.
 *
 * ENV_BESTAND=… npm run google:sleutels   # ander doelbestand
 */

import { createInterface } from "node:readline";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { controleer, huidigeWaarde, zet } from "./env-bestand.mjs";

// Relatief aan dit script, niet aan je huidige map: anders schrijft
// `npm --prefix ~/…/wingman-pa-webapp run google:sleutels` een .env aan in de
// map waar je toevallig stond, en zoek je je scheel waarom de app 'm niet ziet.
const BESTAND = process.env.ENV_BESTAND ?? fileURLToPath(new URL("../.env", import.meta.url));

// Zonder toetsenbord heeft dit script geen betekenis: bij gepipete invoer sluit
// readline op EOF en blijft elke vraag onbeantwoord hangen — het script zou dan
// stil eindigen zonder iets te schrijven, wat lijkt op "gelukt". Liever meteen
// eerlijk zijn dan een geruisloze no-op.
if (!process.stdin.isTTY) {
  console.error(
    "Dit script vraagt om invoer en heeft een terminal nodig.\n" +
      "Draai het rechtstreeks: npm run google:sleutels",
  );
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

/** Gewone vraag; het antwoord is zichtbaar. */
function vraag(tekst) {
  return new Promise((res) => rl.question(tekst, (a) => res(a.trim())));
}

/**
 * Vraag zonder echo. readline schrijft normaal elke toetsaanslag terug naar de
 * terminal; hier onderdrukken we dat, zodat een secret niet op je scherm blijft
 * staan waar iemand overheen kan kijken of een screenshot van maakt.
 */
function vraagStil(tekst) {
  return new Promise((res) => {
    const schrijf = rl._writeToOutput;
    process.stdout.write(tekst);
    // Sterretjes in plaats van niets. Volledig onzichtbare invoer (zoals sudo)
    // is veiliger op papier, maar wie plakt en niets ziet gebeuren, concludeert
    // dat het script hangt — en drukt ctrl-C. Eén teken per aanslag laat zien
    // dat er iets binnenkomt zonder de waarde te tonen.
    rl._writeToOutput = (s) => {
      if (s.includes("\n") || s.includes("\r")) return schrijf.call(rl, s);
      return schrijf.call(rl, "*".repeat(s.length));
    };
    rl.question("", (a) => {
      rl._writeToOutput = schrijf;
      process.stdout.write("\n");
      res(a.trim());
    });
  });
}

/** Alleen ja bij een expliciete j/ja — alles anders is nee. */
async function bevestig(tekst) {
  return ["j", "ja"].includes((await vraag(`${tekst} (j/N) `)).toLowerCase());
}

async function main() {
  console.log(`\nGoogle OAuth-sleutels → ${BESTAND}`);
  console.log("Haal ze op bij console.cloud.google.com/apis/credentials (zie DEPLOY.md §2b).");
  console.log("Plakken en Enter. De secret verschijnt als sterretjes, dat hoort zo.\n");

  let inhoud = existsSync(BESTAND) ? readFileSync(BESTAND, "utf8") : "";

  if (huidigeWaarde(inhoud, "AUTH_GOOGLE_ID")) {
    console.log("Er staan al Google-sleutels in dit bestand.");
    if (!(await bevestig("Overschrijven?"))) {
      console.log("Niets gewijzigd.");
      return;
    }
  }

  const id = await vraag("Client ID:     ");
  const secret = await vraagStil("Client secret: ");

  if (!id || !secret) {
    console.log("Leeg gelaten — niets gewijzigd.");
    return;
  }

  const klachten = controleer(id, secret);
  if (klachten.length > 0) {
    console.log(`\nLet op: ${klachten.join(", ")}.`);
    if (!(await bevestig("Toch opslaan?"))) {
      console.log("Niets gewijzigd.");
      return;
    }
  }

  inhoud = zet(inhoud, "AUTH_GOOGLE_ID", id);
  inhoud = zet(inhoud, "AUTH_GOOGLE_SECRET", secret);

  // Auth.js weigert te starten zonder AUTH_SECRET. Ontbreekt die, dan is dit
  // het moment: anders merk je het pas als de inlogknop een 500 geeft.
  if (!huidigeWaarde(inhoud, "AUTH_SECRET")) {
    inhoud = zet(inhoud, "AUTH_SECRET", randomBytes(32).toString("base64"));
    console.log("AUTH_SECRET ontbrak — een nieuwe gegenereerd.");
  }

  writeFileSync(BESTAND, inhoud, { mode: 0o600 });
  chmodSync(BESTAND, 0o600);

  console.log(`\nOpgeslagen in ${BESTAND} (rechten 600). De sleutels zijn niet getoond.`);
  console.log("\nNog te doen:");
  console.log("  1. Dezelfde twee als env-var in Vercel zetten:");
  console.log("     npx vercel env add AUTH_GOOGLE_ID production");
  console.log("     npx vercel env add AUTH_GOOGLE_SECRET production");
  console.log("  2. npm run dev — op /inloggen staat nu 'Inloggen met Google'.");
}

main()
  .catch((e) => {
    console.error("Mislukt:", e.message);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
