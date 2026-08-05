import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Dev draait single-user op seed-data. In productie komt dit uit de sessie
 * (NextAuth) en staat er row-level security op elke tabel.
 */
export const DEMO_USER_EMAIL = "nora@voorbeeld.nl";

export async function currentUserId(): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
    select: { id: true },
  });
  if (!user) throw new Error("Geen gebruiker gevonden — draai `npm run db:reset`.");
  return user.id;
}
