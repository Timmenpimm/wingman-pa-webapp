-- Fase 0: sync-pipeline (src/lib/sync/engine.ts).
--
-- Twee dingen die hier bij elkaar horen omdat ze allebei van de nieuwe sync-
-- engine komen:
--
-- 1. Dedupe-sleutel voor Event/Email. De engine upsert per bron-item op
--    external_id (die de adapter al uniek en provider-geprefixt aanlevert,
--    "google:xyz"); zonder deze index zou een hersync van dezelfde periode
--    dubbele rijen aanmaken in plaats van bestaande bij te werken.
-- 2. processed_at op Email: nullable haakje voor de extractiefase (LLM,
--    latere PR) om onverwerkte mail te vinden. NULL = nog niet verwerkt.
--    Losstaand van het bestaande `processed`-veld, dat hier niet in wijzigt.
--
-- Handmatig geschreven (geen lokale db beschikbaar voor `prisma migrate dev`
-- in deze omgeving), maar wel gegenereerd met
-- `prisma migrate diff --from-schema-datamodel <schema vóór wijziging>
-- --to-schema-datamodel prisma/schema.prisma --script` — dat leest alleen de
-- twee schemabestanden, geen databaseverbinding nodig, dus de SQL hieronder
-- is het exacte verschil dat Prisma zelf zou hebben gegenereerd.

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "processed_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Event_user_id_external_id_key" ON "Event"("user_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "Email_user_id_external_id_key" ON "Email"("user_id", "external_id");

