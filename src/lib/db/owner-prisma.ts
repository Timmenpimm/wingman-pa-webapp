import { PrismaClient } from "@prisma/client";

/**
 * Eigenaarsrol (postgres, BYPASSRLS), uitsluitend voor het inlogpad.
 *
 * auth.ts zoekt een gebruiker op vóórdat er een sessie bestaat — op dat
 * moment is er nog geen `app.user_id` om te zetten (withUser() heeft een
 * userId nódig, en die ken je nog niet als je nog aan het inloggen bent).
 * Zou die opzoekquery via app_user lopen, dan blokkeert RLS 'm domweg: geen
 * app.user_id gezet betekent geen enkele rij zichtbaar, dus zou niemand ooit
 * kunnen inloggen.
 *
 * Dat is geen gat in de RLS. Deze client leest hier alleen User.email en
 * password_hash om te bepalen wíé iemand IS (authenticatie) — RLS gaat over
 * wat een ingelogde gebruiker daarna mag ZIEN (autorisatie op user-data), en
 * dat blijft na het inloggen altijd via withUser() en app_user lopen. Het
 * wachtwoord zelf wordt nooit met `===` vergeleken maar met bcrypt.compare
 * (zie auth.ts), en authorize() geeft bij een onbekend adres exact dezelfde
 * null terug als bij een fout wachtwoord.
 *
 * Verbindt via DIRECT_URL (de eigenaarsrol, session pooler) in plaats van de
 * transaction pooler: dit is een laagfrequent pad (inlogpogingen, niet de
 * reguliere datastroom van de app) en hoort dus niet op dezelfde pooler-
 * capaciteit te leunen als withUser().
 */
const globalForOwnerPrisma = globalThis as unknown as { ownerPrisma?: PrismaClient };

export const ownerPrisma =
  globalForOwnerPrisma.ownerPrisma ??
  new PrismaClient({
    datasourceUrl: process.env.DIRECT_URL,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForOwnerPrisma.ownerPrisma = ownerPrisma;
