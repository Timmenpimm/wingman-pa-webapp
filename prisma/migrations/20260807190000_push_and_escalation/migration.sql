-- Fase 1: web-push-fundament + escalatielaag.
--
-- Twee nieuwe tabellen die verder niets met elkaar te maken hebben, behalve
-- de timing van deze PR:
--
-- 1. PushSubscription — een browserabonnement (endpoint + sleutels) voor
--    web-push, zie src/lib/push/webpush.ts en src/lib/runs/notify.ts. Eén
--    gebruiker kan meerdere toestellen hebben; `endpoint` is uniek over alle
--    gebruikers heen (de browser genereert 'm, geen twee toestellen delen er
--    een), dus de subscribe-route kan er veilig op upserten.
-- 2. EscalationEvent — het logboek + de dedupe-sleutel van de escalatielaag
--    (src/lib/escalation/engine.ts): (user_id, trigger, ref_id) mag maar één
--    keer voorkomen, anders zou een nieuwe tick hetzelfde openstaande item
--    opnieuw escaleren.
--
-- Handmatig geschreven (geen lokale db beschikbaar in deze omgeving), maar
-- gegenereerd met dezelfde `prisma migrate diff --from-schema-datamodel
-- <schema vóór deze wijziging> --to-schema-datamodel prisma/schema.prisma
-- --script` als 20260807174513_sync_engine — leest alleen de twee
-- schemabestanden, geen databaseverbinding nodig. Het RLS-beleid hieronder is
-- er met de hand bijgezet, net als bij 20260805212457_tool_calls: beide
-- tabellen komen ná de RLS-migratie (20260805205044_enable_rls), dus Prisma
-- genereert daar zelf geen beleid voor.

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationEvent" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationEvent_user_id_trigger_ref_id_key" ON "EscalationEvent"("user_id", "trigger", "ref_id");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, zelfde regel als de andere tabellen met user_id (zie
-- 20260805205044_enable_rls). De GRANT komt al mee via ALTER DEFAULT
-- PRIVILEGES uit die migratie; hier alleen het beleid. FORCE zodat het ook
-- geldt voor de eigenaarsrol die migraties en de seed draait.
CREATE POLICY tenant_isolation ON "PushSubscription"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushSubscription" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "EscalationEvent"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "EscalationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EscalationEvent" FORCE ROW LEVEL SECURITY;
