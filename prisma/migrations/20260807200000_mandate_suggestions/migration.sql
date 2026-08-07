-- Fase 1: de vertrouwensloop — promotievoorstellen (src/lib/mandates/suggest.ts).
--
-- Eén nieuwe tabel: MandateSuggestion. Draait een domein lang genoeg foutloos
-- op niveau 2, dan mag Wingman één keer voorstellen om naar niveau 3 te gaan
-- — nooit vanzelf (decideMandateSuggestion in src/lib/actions.ts beslist, niet
-- de tick).
--
-- Handmatig geschreven (geen lokale db beschikbaar voor `prisma migrate dev`
-- in deze omgeving — zie CLAUDE.md), maar het CreateTable/Index/FK/RLS-blok
-- is het exacte verschil dat `prisma migrate diff --from-schema-datamodel
-- <schema vóór wijziging> --to-schema-datamodel prisma/schema.prisma
-- --script` zelf zou hebben gegenereerd — zelfde patroon als
-- 20260807180000_mandates en 20260807190000_push_and_escalation.
--
-- Bewust geen unique index op (user_id, domain, status): dat zou een tweede
-- *dismissed* voorstel voor hetzelfde domein blokkeren zodra er ooit één
-- gedismisst is, terwijl de tijd wel doorloopt. "Eenmalig" is hier een
-- regel in code (evaluateMandateSuggestion in src/lib/mandates/suggest.ts) —
-- nooit een tweede voorstel zolang er al één bestaat met to_level 3, ongeacht
-- status — geen constraint die de database zelf kan afdwingen.

-- CreateTable
CREATE TABLE "MandateSuggestion" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "from_level" INTEGER NOT NULL,
    "to_level" INTEGER NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "MandateSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MandateSuggestion_user_id_domain_status_idx" ON "MandateSuggestion"("user_id", "domain", "status");

-- AddForeignKey
ALTER TABLE "MandateSuggestion" ADD CONSTRAINT "MandateSuggestion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, zelfde regel als de andere tabellen met user_id (zie
-- 20260805205044_enable_rls). De GRANT komt al mee via ALTER DEFAULT
-- PRIVILEGES uit die migratie; hier alleen het beleid. FORCE zodat het ook
-- geldt voor de eigenaarsrol die migraties en de seed draait.
CREATE POLICY tenant_isolation ON "MandateSuggestion"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "MandateSuggestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MandateSuggestion" FORCE ROW LEVEL SECURITY;
