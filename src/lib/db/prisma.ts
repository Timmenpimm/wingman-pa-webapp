import { PrismaClient } from "@prisma/client";

/**
 * De kale Prisma-singleton, los van client.ts.
 *
 * auth.ts (root) heeft Prisma nodig om een gebruiker op te zoeken tijdens het
 * inloggen; client.ts heeft auth.ts nodig om currentUserId() uit de sessie te
 * halen. Stond de singleton in client.ts, dan importeren de twee bestanden
 * elkaar rond — en omdat import-statements altijd vóór de rest van de module
 * draaien, zou auth.ts op het moment van importeren een nog-niet-geïnitialiseerde
 * `prisma` te pakken krijgen. Dit bestand doorbreekt die cirkel.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
