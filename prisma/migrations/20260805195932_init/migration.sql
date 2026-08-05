-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
    "locale" TEXT NOT NULL DEFAULT 'nl',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "consent_expires_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "permission" TEXT NOT NULL DEFAULT 'propose',
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "last_sync_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connector_id" TEXT,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
    "attendees" TEXT NOT NULL DEFAULT '[]',
    "location" TEXT,
    "meeting_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "transparency" TEXT NOT NULL DEFAULT 'opaque',
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connector_id" TEXT,
    "external_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "from_addr" TEXT NOT NULL,
    "to_addrs" TEXT NOT NULL DEFAULT '[]',
    "sent_at" TIMESTAMP(3) NOT NULL,
    "body_text" TEXT NOT NULL,
    "is_sent" BOOLEAN NOT NULL DEFAULT false,
    "is_unread" BOOLEAN NOT NULL DEFAULT false,
    "labels" TEXT NOT NULL DEFAULT '[]',
    "processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connector_id" TEXT,
    "external_id" TEXT NOT NULL,
    "account_iban" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "booked_at" TIMESTAMP(3) NOT NULL,
    "counterparty" TEXT,
    "description" TEXT,
    "category" TEXT,
    "category_confidence" DOUBLE PRECISION,
    "transaction_type" TEXT NOT NULL DEFAULT 'transfer',
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "project_id" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_ref" TEXT NOT NULL,
    "source_label" TEXT,
    "direction" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "party_contact" TEXT,
    "what" TEXT NOT NULL,
    "context" TEXT,
    "due_date" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'open',
    "snooze_until" TIMESTAMP(3),
    "last_nudge_at" TIMESTAMP(3),
    "nudge_count" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "project_id" TEXT,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emails" TEXT NOT NULL DEFAULT '[]',
    "organizations" TEXT NOT NULL DEFAULT '[]',
    "roles" TEXT NOT NULL DEFAULT '[]',
    "frequency_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_contact_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "status_line" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBriefing" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "frog_title" TEXT NOT NULL,
    "frog_sub" TEXT,
    "frog_implement" TEXT,
    "frog_status" TEXT NOT NULL DEFAULT 'open',
    "coach_text" TEXT NOT NULL,
    "priorities" TEXT NOT NULL DEFAULT '[]',
    "confirmations" TEXT NOT NULL DEFAULT '[]',
    "degraded" TEXT NOT NULL DEFAULT '[]',
    "schema_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'capture',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'new',
    "routed_to" TEXT,

    CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleCard" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "register" TEXT NOT NULL,
    "greeting" TEXT NOT NULL,
    "signoff" TEXT NOT NULL,
    "avg_words" INTEGER NOT NULL,
    "typical" TEXT NOT NULL DEFAULT '[]',
    "edited_by_user" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StyleCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphNode" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "summary" TEXT,
    "cluster" TEXT,

    CONSTRAINT "GraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphEdge" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "to_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "GraphEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Connector_user_id_provider_account_id_key" ON "Connector"("user_id", "provider", "account_id");

-- CreateIndex
CREATE INDEX "Event_user_id_start_at_idx" ON "Event"("user_id", "start_at");

-- CreateIndex
CREATE INDEX "Email_user_id_thread_id_idx" ON "Email"("user_id", "thread_id");

-- CreateIndex
CREATE INDEX "Transaction_user_id_booked_at_idx" ON "Transaction"("user_id", "booked_at");

-- CreateIndex
CREATE INDEX "Commitment_user_id_status_due_date_idx" ON "Commitment"("user_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBriefing_user_id_date_key" ON "DailyBriefing"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StyleCard_user_id_register_key" ON "StyleCard"("user_id", "register");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_user_id_key_key" ON "UserSetting"("user_id", "key");

-- CreateIndex
CREATE INDEX "GraphEdge_user_id_from_id_idx" ON "GraphEdge"("user_id", "from_id");

-- AddForeignKey
ALTER TABLE "Connector" ADD CONSTRAINT "Connector_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBriefing" ADD CONSTRAINT "DailyBriefing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
