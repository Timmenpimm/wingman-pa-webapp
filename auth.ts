import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { ownerPrisma as prisma } from "@/lib/db/owner-prisma";
import { verifyMagicLinkToken } from "@/lib/auth/magic-link";
import { findOrCreateUserByEmail, upsertGoogleConnectors } from "@/lib/auth/google-connectors";

/**
 * Volledige NextAuth-config — alleen voor Node-contexten (route handlers,
 * server components, server actions). middleware.ts draait in Edge en
 * importeert dit bestand nooit, alleen auth.config.ts (zie de uitleg daar).
 *
 * Wachtwoorden worden hier nooit zelf vergeleken met ===: bcrypt.compare doet
 * dat in constante tijd. Er wordt ook nooit onderscheid gemaakt tussen
 * "onbekend e-mailadres" en "verkeerd wachtwoord" — authorize() geeft in
 * beide gevallen null, zodat een aanvaller niet kan aftasten welke adressen
 * bestaan.
 *
 * De user-by-email-lookups hieronder gaan bewust via ownerPrisma (de
 * eigenaarsrol), niet via de gewone `prisma`/withUser()-route: er is hier nog
 * geen sessie en dus geen userId om app.user_id mee te zetten. Zie de
 * toelichting in src/lib/db/owner-prisma.ts voor waarom dat geen gat in de
 * RLS is.
 */
const credentialsProvider = Credentials({
  id: "credentials",
  name: "Wachtwoord",
  credentials: {
    email: { label: "E-mail", type: "email" },
    password: { label: "Wachtwoord", type: "password" },
  },
  async authorize(credentials) {
    const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
    const password = typeof credentials?.password === "string" ? credentials.password : "";
    if (!email || !password) return null;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.password_hash) return null;

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;

    return { id: user.id, email: user.email, name: user.name ?? undefined };
  },
});

/**
 * Consumeert het token uit de inloglink (src/lib/auth/magic-link.ts). Deze
 * provider bestaat alleen in de lijst als AUTH_EMAIL_SERVER is gezet — zonder
 * mailserver wordt er nooit een token verstuurd, dus zou hij toch nooit
 * geldig aangeroepen worden. Hem dan weglaten voorkomt een aanvalsoppervlak
 * dat niets toevoegt.
 *
 * findOrCreateUserByEmail() (in plaats van findUnique) maakt dit meteen ook
 * het registratiepad voor de inloglink: /api/auth/magic-link stuurt de link
 * naar elk adres, bestaand of niet (zie de toelichting daar), dus de User
 * ontstaat pas hier, bij het verzilveren — met een geldig, ondertekend token
 * als bewijs dat het adres van de aanvrager is.
 */
const magicLinkProvider = Credentials({
  id: "magic-link",
  name: "Inloglink",
  credentials: {
    token: { label: "Token", type: "text" },
  },
  async authorize(credentials) {
    const token = typeof credentials?.token === "string" ? credentials.token : "";
    if (!token) return null;

    const email = await verifyMagicLinkToken(token);
    if (!email) return null;

    const user = await findOrCreateUserByEmail(email);
    return { id: user.id, email: user.email, name: user.name ?? undefined };
  },
});

/**
 * "Inloggen met Google" + connector-autorisatie in één stap: naast de gewone
 * OIDC-scopes vragen we meteen agenda- en gmail-toegang op, zodat de
 * gebruiker niet twee keer langs een Google-consentscherm hoeft. Zonder
 * access_type=offline + prompt=consent geeft Google alleen bij het állereerste
 * consent ooit een refresh_token terug — met prompt=consent forceren we dat
 * bij elke login, wat hier bewust is: zonder refresh_token kan de connector
 * na een uur niet meer ververst worden (zie src/lib/auth/google-token.ts).
 *
 * calendar.readonly en gmail.* zijn restricted scopes: vóór productie is een
 * CASA-assessment nodig en tot die tijd staat het Google Cloud-project op
 * "Testing" (max. 100 testgebruikers) — zie de toelichting in
 * src/connectors/google-calendar.ts en het redirect-URI-blok in DEPLOY.md.
 *
 * Alleen in de providerlijst als AUTH_GOOGLE_ID/-SECRET gezet zijn — net als
 * magicLinkProvider hierboven: geen key betekent geen aanvalsoppervlak dat
 * toch nooit geldig aangeroepen kan worden.
 */
const googleProvider = Google({
  authorization: {
    params: {
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
    },
  },
});

const hasGoogleOAuth = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const providers: Provider[] = [credentialsProvider];
if (process.env.AUTH_EMAIL_SERVER) providers.push(magicLinkProvider);
if (hasGoogleOAuth) providers.push(googleProvider);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,

    /**
     * Draait vóór er een sessie bestaat. Voor Google: koppelt aan een
     * bestaande User met hetzelfde e-mailadres (nooit een tweede User) en
     * schrijft/ververst meteen de twee Connector-rijen (agenda + gmail).
     *
     * We muteren hier `user.id` naar onze eigen cuid. Er is geen
     * PrismaAdapter geconfigureerd (JWT-only sessions, zie auth.config.ts) —
     * zonder adapter geeft Auth.js hetzelfde `user`-object door aan de
     * jwt-callback hieronder, dus die ziet via `user.id` meteen onze eigen
     * userId in plaats van Googles `sub`. Zie next-auth.d.ts voor waarom
     * currentUserId() (src/lib/db/client.ts) op precies dat veld leunt.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      if (!profile?.email || profile.email_verified !== true) return false;

      const dbUser = await findOrCreateUserByEmail(profile.email, profile.name);
      user.id = dbUser.id;

      await upsertGoogleConnectors(dbUser.id, profile.email, {
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expires_at: account.expires_at,
        scope: account.scope,
      });

      return true;
    },

    // authConfig.jwt zet token.uid = user.id — dat is hier al genoeg, ook
    // voor Google, dankzij de mutatie in signIn() hierboven.
  },
});
