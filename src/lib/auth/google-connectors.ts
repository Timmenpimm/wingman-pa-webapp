import { encryptOptional, encryptSecret } from "@/lib/crypto/secrets";
import { ownerPrisma } from "@/lib/db/owner-prisma";
import { withUser } from "@/lib/db/with-user";
import { ensureDefaultRuns } from "@/lib/runs/ensure-defaults";

/**
 * Koppelt een geslaagde Google-login aan Connector-rijen.
 *
 * Wordt aangeroepen vanuit de `signIn`-callback in auth.ts, dus vóórdat er
 * een sessie/JWT bestaat — findOrCreateUserByEmail() gaat daarom via
 * ownerPrisma (eigenaarsrol), net als de credentials- en magic-link-paden in
 * auth.ts. Zie de toelichting in src/lib/db/owner-prisma.ts voor waarom dat
 * geen gat in de RLS is. upsertGoogleConnectors() draait wél via withUser(),
 * want daar ken je de userId al.
 */

/** Ruwe tokendata zoals NextAuth die in de `account`-callback-parameter levert. */
export interface GoogleAccountTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  /** Unix-timestamp in seconden (account.expires_at uit next-auth), niet ms. */
  expires_at?: number | null;
  scope?: string | null;
}

/**
 * Vindt de User bij dit e-mailadres, of maakt er één aan. Bestaat er al een
 * User met hetzelfde adres (aangemaakt via wachtwoord, inloglink of Google),
 * dan koppelt deze login daaraan — er komt nooit een tweede User voor hetzelfde
 * e-mailadres bij. `timezone`/`locale` komen niet expliciet mee: het schema
 * zet daar zelf "Europe/Amsterdam" / "nl" als default op `create`.
 *
 * Ook het inloglink-pad gebruikt deze functie (zie auth.ts,
 * magicLinkProvider): een inloglink naar een onbekend adres registreert dus
 * net als Google — de User ontstaat pas bij het verzilveren van de link, niet
 * bij het versturen ervan.
 *
 * Dit is het énige punt waar een echte User ontstaat (de wachtwoordprovider
 * in auth.ts zoekt alleen op, prisma/seed.ts is dev-fixture). Daarom staat
 * ensureDefaultRuns() hier en niet bij de aanroepers: "er is een User"
 * betekent daarmee altijd ook "er staan drie momenten klaar", zonder dat een
 * derde inlogpad dat later kan vergeten.
 */
export async function findOrCreateUserByEmail(
  email: string,
  name?: string | null,
): Promise<{ id: string; email: string; name: string | null }> {
  const normalized = email.trim().toLowerCase();
  const user = await ownerPrisma.user.upsert({
    where: { email: normalized },
    update: {},
    create: { email: normalized, name: name ?? undefined },
    select: { id: true, email: true, name: true },
  });

  await ensureDefaultRuns(user.id);

  return user;
}

const GOOGLE_CONNECTOR_ROWS = [
  { provider: "google", type: "calendar", label: "Google Agenda" },
  { provider: "gmail", type: "mail", label: "Gmail" },
] as const;

/**
 * Schrijft/ververst de twee Connector-rijen (agenda + mail) na een geslaagde
 * Google-autorisatie. Idempotent via de unique-constraint op
 * (user_id, provider, account_id) — opnieuw inloggen werkt de bestaande rij
 * bij in plaats van een duplicaat te maken.
 *
 * Google geeft een refresh_token alleen terug bij het eerste consent-scherm
 * (of wanneer prompt=consent forceert — zie auth.ts). Komt er bij een latere
 * login geen refresh_token mee, dan laat de update die kolom met rust
 * (Prisma: een `undefined`-veld in `update` wijzigt niets) in plaats van een
 * geldig token te overschrijven met null.
 */
export async function upsertGoogleConnectors(
  userId: string,
  email: string,
  tokens: GoogleAccountTokens,
): Promise<void> {
  const accountId = email.trim().toLowerCase();
  const scopes = JSON.stringify((tokens.scope ?? "").split(" ").filter(Boolean));
  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at * 1000) : null;

  await withUser(userId, async (tx) => {
    for (const row of GOOGLE_CONNECTOR_ROWS) {
      const where = {
        user_id_provider_account_id: {
          user_id: userId,
          provider: row.provider,
          account_id: accountId,
        },
      };
      await tx.connector.upsert({
        where,
        create: {
          user_id: userId,
          provider: row.provider,
          type: row.type,
          label: row.label,
          account_id: accountId,
          // Versleuteld de database in: een refresh_token geeft doorlopend
          // toegang tot agenda en mail en is niet te resetten zoals een
          // wachtwoord. Zie src/lib/crypto/secrets.ts.
          access_token: encryptOptional(tokens.access_token),
          refresh_token: encryptOptional(tokens.refresh_token),
          expires_at: expiresAt,
          scopes,
          status: "active",
          error_message: null,
        },
        update: {
          access_token: tokens.access_token ? encryptSecret(tokens.access_token) : undefined,
          refresh_token: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : undefined,
          expires_at: expiresAt ?? undefined,
          scopes,
          status: "active",
          error_message: null,
        },
      });
    }
  });
}
