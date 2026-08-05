-- Row-level security: de databaseregel naast de codelregel.
--
-- Elke query in de app filtert al op user_id — maar die regel staat alleen in
-- de code. Eén vergeten `where` en de app serveert andermans agenda, mail en
-- banktransacties. RLS legt dezelfde regel in de database zelf, zodat een fout
-- in de code geen datalek meer kan zijn: de rij is er voor die verbinding
-- gewoon niet, ongeacht wat de query vraagt.
--
-- Dat werkt alleen als de rol die de query uitvoert géén BYPASSRLS heeft. De
-- app draaide tot nu toe als `postgres`, en die rol omzeilt RLS altijd — het
-- beleid hieronder zou voor haar dode letter zijn. Vandaar eerst een aparte,
-- beperkte rol.

-- ─── 1. app_user: de rol waarmee de app draait ────────────────────────────
-- Alleen CRUD op de bestaande tabellen, geen DDL, geen BYPASSRLS. Wachtwoord
-- wordt hieronder los gezet (zie prisma/migrations/.../set_app_user_password
-- — nee: het wachtwoord staat NIET in deze file, zie de opmerking onderaan).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN;
  END IF;
END
$$;

-- Databasenaam niet hardcoderen: lokaal heet hij "wingman", op Supabase
-- "postgres". Een migratie die maar op één van beide draait, wordt precies op
-- de verkeerde plek voor het eerst uitgeprobeerd.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Zonder dit moet elke volgende `prisma migrate` handmatig een GRANT
-- toevoegen voor de nieuwe tabel — en dat wordt een keer vergeten. Dit zorgt
-- dat een tabel die postgres (de eigenaarsrol, waarmee migraties draaien)
-- straks aanmaakt automatisch dezelfde rechten voor app_user krijgt.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- ─── 2. RLS + policy per tabel ─────────────────────────────────────────────
-- ENABLE alleen is niet genoeg: dat beleid geldt dan wél voor app_user, maar
-- NIET voor de tabel-eigenaar (postgres — dezelfde rol die migraties en de
-- seed draait). FORCE laat het beleid ook voor de eigenaar gelden, behalve
-- voor rollen met BYPASSRLS (dus postgres kan nog steeds bewust als
-- eigenaar om het beleid heen, precies zoals seed.ts en auth.ts dat nodig
-- hebben — zie de toelichting daar).
--
-- app.user_id komt uit set_config() in withUser() (src/lib/db/with-user.ts).
-- current_setting(..., true) met de tweede parameter geeft NULL terug als de
-- setting niet bestaat, in plaats van een fout te gooien — dat is precies wat
-- we willen: geen sessievariabele gezet betekent geen enkele rij zichtbaar,
-- niet een crash. user_id is tekst (cuid), dus current_setting (ook tekst)
-- kan er direct tegen vergeleken worden; geen cast naar uuid.
CREATE POLICY tenant_isolation ON "Connector"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "Connector" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Connector" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Event"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Email"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "Email" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Email" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Transaction"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Commitment"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "Commitment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Commitment" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Person"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "Person" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Person" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Project"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "DailyBriefing"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "DailyBriefing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyBriefing" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "InboxItem"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "InboxItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxItem" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "StyleCard"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "StyleCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StyleCard" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "UserSetting"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "UserSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserSetting" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "GraphNode"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "GraphNode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GraphNode" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "GraphEdge"
  FOR ALL USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));
ALTER TABLE "GraphEdge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GraphEdge" FORCE ROW LEVEL SECURITY;

-- User heeft geen user_id-kolom — de rij IS de gebruiker, dus de vergelijking
-- gaat tegen "id".
CREATE POLICY tenant_isolation ON "User"
  FOR ALL USING (id = current_setting('app.user_id', true))
  WITH CHECK (id = current_setting('app.user_id', true));
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

-- ─── 3. Wachtwoord voor app_user ───────────────────────────────────────────
-- Met opzet niet hierboven in CREATE ROLE: deze file komt in git, en er komt
-- nooit een echt wachtwoord in een bestand dat in git komt. Het wachtwoord is
-- na deze migratie apart gezet met ALTER ROLE ... WITH PASSWORD, buiten deze
-- file om (zie het rapport / .env voor waar het staat). Draai je deze
-- migratie op een nieuwe omgeving na, zet dan zelf een wachtwoord:
--   ALTER ROLE app_user WITH PASSWORD '<genereer iets sterks>';
