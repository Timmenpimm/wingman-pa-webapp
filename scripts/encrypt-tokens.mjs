/**
 * Zet bestaande, onversleutelde connector-tokens eenmalig om.
 *
 * De app leest onversleutelde waarden nog gewoon (zie decryptSecret), zodat
 * uitrollen geen enkele koppeling breekt. Dit script haalt die achterstand
 * daarna in. Het is idempotent: al versleutelde rijen slaat hij over, dus twee
 * keer draaien kan geen kwaad.
 *
 *   node --env-file=.env scripts/encrypt-tokens.mjs          # toont wat er zou gebeuren
 *   node --env-file=.env scripts/encrypt-tokens.mjs --doen   # voert het uit
 *
 * Draait als eigenaarsrol (DIRECT_URL): dit raakt de rijen van álle gebruikers
 * en kan dus niet achter row-level security langs.
 */

import { PrismaClient } from "@prisma/client";
import { createCipheriv, randomBytes } from "node:crypto";

const DOEN = process.argv.includes("--doen");

const sleutel = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64");
if (sleutel.length !== 32) {
  console.error("TOKEN_ENCRYPTION_KEY ontbreekt of is niet 32 bytes. Maak er een met: openssl rand -base64 32");
  process.exit(1);
}

const isVersleuteld = (w) => typeof w === "string" && w.split(".").length === 4 && w.startsWith("v1.");

function versleutel(plat) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sleutel, iv);
  const data = Buffer.concat([cipher.update(plat, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

const rijen = await prisma.connector.findMany({
  select: { id: true, label: true, access_token: true, refresh_token: true },
});

let omgezet = 0;
let alGoed = 0;
let leeg = 0;

for (const rij of rijen) {
  const data = {};
  for (const veld of ["access_token", "refresh_token"]) {
    const waarde = rij[veld];
    if (!waarde) continue;
    if (isVersleuteld(waarde)) continue;
    data[veld] = versleutel(waarde);
  }

  if (Object.keys(data).length === 0) {
    if (!rij.access_token && !rij.refresh_token) leeg++;
    else alGoed++;
    continue;
  }

  console.log(`  ${DOEN ? "omgezet" : "zou omzetten"}: ${rij.label} (${Object.keys(data).join(", ")})`);
  if (DOEN) await prisma.connector.update({ where: { id: rij.id }, data });
  omgezet++;
}

console.log(
  `\n${rijen.length} connectors: ${omgezet} ${DOEN ? "omgezet" : "nog om te zetten"}, ${alGoed} al versleuteld, ${leeg} zonder token.`,
);
if (!DOEN && omgezet > 0) console.log("Voer uit met --doen om het echt te doen.\n");

await prisma.$disconnect();
