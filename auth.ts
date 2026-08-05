import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { ownerPrisma as prisma } from "@/lib/db/owner-prisma";
import { verifyMagicLinkToken } from "@/lib/auth/magic-link";

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

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    return { id: user.id, email: user.email, name: user.name ?? undefined };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: process.env.AUTH_EMAIL_SERVER
    ? [credentialsProvider, magicLinkProvider]
    : [credentialsProvider],
});
