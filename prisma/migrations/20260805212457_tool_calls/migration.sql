-- CreateTable
CREATE TABLE "ToolCall" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connector_id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "params" TEXT NOT NULL DEFAULT '{}',
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolCall_user_id_status_created_at_idx" ON "ToolCall"("user_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "ToolCall" ADD CONSTRAINT "ToolCall_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, zelfde regel als de andere tabellen met user_id (zie
-- 20260805205044_enable_rls). Prisma genereert dit niet: een nieuwe tabel komt
-- er zonder beleid in, en zonder beleid is een tabel met acties-van-de-gebruiker
-- precies de tabel die je niet ongemerkt open wilt hebben staan.
--
-- De GRANT komt van ALTER DEFAULT PRIVILEGES uit die migratie; hier alleen het
-- beleid. FORCE zodat het ook geldt voor de eigenaarsrol die de seed draait.
CREATE POLICY tenant_isolation ON "ToolCall"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "ToolCall" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ToolCall" FORCE ROW LEVEL SECURITY;
