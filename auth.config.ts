import type { NextAuthConfig } from "next-auth";

/**
 * Edge-veilig deel van de NextAuth-config.
 *
 * middleware.ts draait in de Edge-runtime en importeert alleen dít bestand —
 * nooit auth.ts. auth.ts trekt Prisma en bcryptjs binnen (via de
 * Credentials-provider), en geen van beide werkt in Edge. Zolang dit bestand
 * providers leeg laat en niets uit auth.ts of src/lib/db importeert, kan
 * middleware.ts een sessie-JWT decoderen zonder Node-only code mee te bundelen.
 *
 * providers staat hier bewust op [] — auth.ts vult 'm aan voor de kant die wel
 * in Node draait (route handlers, server components, server actions).
 */
export const authConfig = {
  pages: {
    signIn: "/inloggen",
  },
  session: {
    strategy: "jwt",
  },
  // Self-hosted (niet-Vercel) omgevingen moeten expliciet vertrouwen — zonder
  // dit weigert Auth.js requests met een onbekende host-header.
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
