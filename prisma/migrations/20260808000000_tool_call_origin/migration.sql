-- Fase 2: de voorstelmotor (src/brain/propose.ts).
--
-- Twee kolommen op ToolCall. Tot nu toe kwam elke rij in die tabel van een
-- knop of een REST-aanroep; vanaf nu bedenkt de tick zelf voorstellen. Dat
-- vraagt twee dingen die er nog niet waren:
--
--   origin      wie het vroeg. De UI zegt "Wingman stelt voor" bij een
--               voorstel en "je vroeg dit" bij de rest — en de dagcap op
--               voorstellen telt alleen de eigen rijen.
--   dedupe_key  wat er al eens voorgesteld is. De planner draait elke vijftien
--               minuten; zonder sleutel is één agendablok 96 voorstellen per
--               dag. NULL voor alles wat de gebruiker zelf vraagt: die mag
--               dezelfde tool twee keer aanroepen, en NULL botst in Postgres
--               nooit met een unique index.
--
-- Handmatig geschreven (geen lokale db in deze omgeving — zie CLAUDE.md), maar
-- exact het verschil dat `prisma migrate diff` zou opleveren. Zelfde patroon
-- als 20260807200000_mandate_suggestions.

-- AlterTable
ALTER TABLE "ToolCall" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "ToolCall" ADD COLUMN "dedupe_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ToolCall_user_id_dedupe_key_key" ON "ToolCall"("user_id", "dedupe_key");
CREATE INDEX "ToolCall_user_id_origin_created_at_idx" ON "ToolCall"("user_id", "origin", "created_at");

-- Geen nieuw RLS-beleid: ToolCall heeft dat al sinds 20260805212457_tool_calls,
-- en een kolom erbij valt onder hetzelfde beleid.
