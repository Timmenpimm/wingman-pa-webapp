import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Versleuteling van connector-tokens vóór ze de database in gaan.
 *
 * Waarom dit nodig is: in `Connector` ligt een Google refresh_token. Dat is
 * geen wachtwoord dat je kunt resetten — het geeft doorlopend toegang tot
 * iemands agenda én mail, en het blijft geldig tot de gebruiker het intrekt.
 * Row-level security beschermt tegen een fout in de app; tegen een
 * databasedump doet het niets, en juist in zo'n dump is dit het waardevolste
 * dat erin staat.
 *
 * Waarom in de app en niet met pgcrypto: bij pgcrypto reist de sleutel mee in
 * de query. Die belandt dan in de logs van Postgres en van de pooler, en dan
 * ligt de sleutel naast de data die hij moet beschermen.
 *
 * AES-256-GCM: versleutelt én verzegelt. Een gewijzigde byte laat het
 * ontsleutelen falen in plaats van stilletjes iets anders op te leveren.
 *
 * Opslagvorm: `v1.<iv>.<tag>.<data>`, alles base64url. Het versienummer staat
 * er zodat een volgende sleutel- of algoritmewissel bestaande rijen kan blijven
 * lezen zonder te gokken wat er staat.
 */

const VERSIE = "v1";
const ALGORITME = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, de aanbevolen lengte voor GCM
const SLEUTEL_BYTES = 32;

let gecachedeSleutel: Buffer | null = null;

function sleutel(): Buffer {
  if (gecachedeSleutel) return gecachedeSleutel;

  const ruw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!ruw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY ontbreekt. Zonder die sleutel kunnen connector-tokens " +
        "niet veilig worden opgeslagen. Genereer er een met: openssl rand -base64 32",
    );
  }

  const buf = Buffer.from(ruw, "base64");
  if (buf.length !== SLEUTEL_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY moet ${SLEUTEL_BYTES} bytes zijn (base64), niet ${buf.length}. ` +
        "Genereer er een met: openssl rand -base64 32",
    );
  }

  gecachedeSleutel = buf;
  return buf;
}

/** Alleen voor tests: dwingt een nieuwe sleutel uit de omgeving af. */
export function vergeetSleutel(): void {
  gecachedeSleutel = null;
}

export function encryptSecret(plat: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITME, sleutel(), iv);
  const data = Buffer.concat([cipher.update(plat, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSIE, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(
    ".",
  );
}

/**
 * Ontsleutelt wat er in de kolom staat.
 *
 * Waarden zonder versieprefix zijn van vóór deze wijziging en worden
 * ongewijzigd teruggegeven. Dat is bewust: anders breekt elke bestaande
 * koppeling op het moment van uitrollen. `scripts/encrypt-tokens.mjs` haalt
 * die rijen daarna eenmalig door de versleuteling heen; zodra dat gebeurd is,
 * kan deze uitzondering weg.
 */
export function decryptSecret(opgeslagen: string): string {
  if (!isEncrypted(opgeslagen)) return opgeslagen;

  const [, ivDeel, tagDeel, dataDeel] = opgeslagen.split(".");
  const decipher = createDecipheriv(ALGORITME, sleutel(), Buffer.from(ivDeel, "base64url"));
  decipher.setAuthTag(Buffer.from(tagDeel, "base64url"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(dataDeel, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Verkeerde sleutel of geknoeide rij. Niet de oorspronkelijke fout
    // doorgeven: die verschilt per oorzaak en zegt een aanvaller te veel.
    throw new Error(
      "Token kon niet ontsleuteld worden. Klopt TOKEN_ENCRYPTION_KEY nog, of is de rij gewijzigd?",
    );
  }
}

export function isEncrypted(waarde: string): boolean {
  const delen = waarde.split(".");
  return delen.length === 4 && delen[0] === VERSIE;
}

/** Handig voor null-kolommen: geen waarde blijft geen waarde. */
export function encryptOptional(plat?: string | null): string | null {
  return plat ? encryptSecret(plat) : null;
}

export function decryptOptional(opgeslagen?: string | null): string | undefined {
  return opgeslagen ? decryptSecret(opgeslagen) : undefined;
}

/**
 * Vergelijkt twee geheimen zonder via de responstijd te verraden hoeveel van
 * het begin klopte. Niet gebruikt voor tokens zelf, wel voor webhook-
 * handtekeningen — dezelfde valkuil, dus hier één keer goed opgeschreven.
 */
export function veiligGelijk(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
