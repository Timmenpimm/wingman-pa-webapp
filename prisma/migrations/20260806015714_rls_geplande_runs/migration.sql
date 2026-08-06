-- Row-level security voor de tabellen van de geplande runs.
--
-- Deze twee zijn ná de RLS-migratie aangemaakt en vielen daardoor buiten het
-- beleid: rechten erven mee via ALTER DEFAULT PRIVILEGES, maar het aanzetten
-- van RLS en het beleid zelf niet. Zonder dit kan app_user elkaars
-- runschema's en logboeken lezen — inclusief de samenvattingsregel, en daar
-- staat inhoud in ("Vandaag één ding: verzekeraar bellen over de claim").

ALTER TABLE "ScheduledRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduledRun" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduledrun_eigen_rijen ON "ScheduledRun";
CREATE POLICY scheduledrun_eigen_rijen ON "ScheduledRun"
  FOR ALL
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER TABLE "RunLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RunLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS runlog_eigen_rijen ON "RunLog";
CREATE POLICY runlog_eigen_rijen ON "RunLog"
  FOR ALL
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "ScheduledRun", "RunLog" TO app_user;
