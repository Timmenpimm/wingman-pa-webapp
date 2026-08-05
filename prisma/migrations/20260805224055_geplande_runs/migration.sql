-- CreateTable
CREATE TABLE "ScheduledRun" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "days" TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
    "channel" TEXT NOT NULL DEFAULT 'mail',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_on" TEXT,

    CONSTRAINT "ScheduledRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ran_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "local_date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "duration_ms" INTEGER,

    CONSTRAINT "RunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledRun_enabled_idx" ON "ScheduledRun"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledRun_user_id_kind_key" ON "ScheduledRun"("user_id", "kind");

-- CreateIndex
CREATE INDEX "RunLog_user_id_ran_at_idx" ON "RunLog"("user_id", "ran_at");

-- AddForeignKey
ALTER TABLE "ScheduledRun" ADD CONSTRAINT "ScheduledRun_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunLog" ADD CONSTRAINT "RunLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
