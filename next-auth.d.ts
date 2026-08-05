import type { DefaultSession } from "next-auth";

/**
 * currentUserId() (src/lib/db/client.ts) leest session.user.id — dat veld
 * bestaat niet in de kale NextAuth-types. Deze module-augmentatie voegt het
 * toe, aan zowel de sessie (client + server) als het JWT (callbacks.jwt).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
  }
}
