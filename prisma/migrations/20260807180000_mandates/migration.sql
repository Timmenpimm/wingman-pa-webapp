-- Fase 1: mandaatmodel (src/lib/mandates/domains.ts).
--
-- Drie niveaus per domein vervangen de vier standen per connector
-- (Connector.permission) voor elke gate-beslissing. Die kolom blijft staan —
-- verwijderen komt later — maar na deze migratie leest niets hem nog voor een
-- gate() (zie src/lib/tools/execute.ts en src/app/api/v1/tools/route.ts, die nu
-- allebei Mandate lezen via src/lib/mandates/lookup.ts).
--
-- Handmatig geschreven (geen lokale db beschikbaar voor `prisma migrate dev`
-- in deze omgeving — zie CLAUDE.md), maar de CreateTable/FK/RLS-blokken zijn
-- het exacte verschil dat `prisma migrate diff --from-schema-datamodel <schema
-- vóór wijziging> --to-schema-datamodel prisma/schema.prisma --script` zelf
-- zou hebben gegenereerd (zie 20260807174513_sync_engine voor hetzelfde
-- patroon). De datamigratie eronder is met de hand toegevoegd.

-- CreateTable
CREATE TABLE "Mandate" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "rules" TEXT NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mandate_user_id_domain_key" ON "Mandate"("user_id", "domain");

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, zelfde regel als ToolCall (zie 20260805212457_tool_calls
-- en de toelichting in 20260805205044_enable_rls). De GRANT komt al mee via
-- ALTER DEFAULT PRIVILEGES uit die laatste migratie; hier alleen het beleid.
CREATE POLICY tenant_isolation ON "Mandate"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "Mandate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Mandate" FORCE ROW LEVEL SECURITY;

-- ─── Datamigratie: Connector.permission → Mandate per domein ──────────────
--
-- Zelfde regel als src/lib/mandates/derive.ts (apart getest in
-- tests/tools.test.ts): propose→1, draft→2, act_and_report→3 (melden),
-- silent→3 (stil). Bij twee connectors op hetzelfde domein wint het
-- voorzichtigste niveau (laagste getal); bij een gelijkspel in niveau wint
-- "melden" van "stil".
--
-- provider_domain herhaalt de vaste koppeling tussen provider en domein die
-- ook in de tools zelf staat (calendar.list_day/calendar.create_event op
-- provider "google" → domain "calendar" in src/connectors/google-calendar.ts;
-- gmail.draft_reply op provider "gmail" → domain "email_send" in
-- src/connectors/gmail.ts). Een provider zonder tools (bank, CalDAV, IMAP)
-- staat hier bewust niet in: geen domein, dus geen mandaatrij.
--
-- id: Mandate.id is @default(cuid()) in het schema, maar dat is een
-- clientside default (Prisma Client genereert 'm bij een insert via de app,
-- niet de database). Voor deze eenmalige datamigratie gebruiken we
-- gen_random_uuid() — sinds Postgres 13 ingebouwd, geen extension nodig, en
-- het kolomtype is een vrije tekst-id zonder formaatcontrole.
WITH provider_domain (provider, domain) AS (
  VALUES ('google', 'calendar'), ('gmail', 'email_send')
),
per_connector AS (
  SELECT
    c.user_id,
    pd.domain,
    CASE c.permission
      WHEN 'draft' THEN 2
      WHEN 'act_and_report' THEN 3
      WHEN 'silent' THEN 3
      ELSE 1
    END AS level,
    CASE WHEN c.permission = 'silent' THEN 'stil' ELSE 'melden' END AS notify
  FROM "Connector" c
  JOIN provider_domain pd ON pd.provider = c.provider
),
gewonnen AS (
  -- DISTINCT ON pakt de eerste rij per (user_id, domain) na deze sortering:
  -- laagste niveau eerst, en bij een gelijk niveau "melden" (notify = 'melden'
  -- sorteert vóór 'stil' met DESC op de boolean).
  SELECT DISTINCT ON (user_id, domain)
    user_id, domain, level, notify
  FROM per_connector
  ORDER BY user_id, domain, level ASC, (notify = 'melden') DESC
)
INSERT INTO "Mandate" (id, user_id, domain, level, rules, updated_at)
SELECT
  gen_random_uuid()::text,
  user_id,
  domain,
  level,
  jsonb_build_object('notify', notify)::text,
  now()
FROM gewonnen
ON CONFLICT (user_id, domain) DO NOTHING;
