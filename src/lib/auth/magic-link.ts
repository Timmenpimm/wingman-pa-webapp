import { SignJWT, jwtVerify } from "jose";

/**
 * Tekent en verifieert het eenmalige token achter "Stuur me een inloglink".
 *
 * Geen eigen crypto: dit is jose (dezelfde JWS-bibliotheek die next-auth zelf
 * gebruikt voor sessie-JWT's), niet een zelfgeschreven schema. Het token
 * bevat alleen het e-mailadres, is 15 minuten geldig en is gebonden aan een
 * eigen audience zodat het nooit als sessie-token te misbruiken is.
 *
 * Geen database-tabel nodig (geen VerificationToken-model): het token draagt
 * zijn eigen geldigheid in de handtekening, net zoals de sessie-JWT dat doet.
 */
const AUDIENCE = "wingman-magic-link";
const TTL = "15m";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET ontbreekt — nodig om inloglinks te tekenen en te verifiëren.");
  }
  return new TextEncoder().encode(secret);
}

export async function signMagicLinkToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secretKey());
}

/** Geeft het e-mailadres terug bij een geldig, niet-verlopen token — anders null. */
export async function verifyMagicLinkToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: AUDIENCE });
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
