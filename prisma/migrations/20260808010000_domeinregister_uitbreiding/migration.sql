-- Blokkade 4: het domeinregister dekte tot nu toe 2 van de 9 domeinen uit het
-- addendum (docs/WINGMAN_ADDENDUM_mandaten.md, §2). Met de overige 7 erbij
-- (src/lib/mandates/domains.ts) hoort elke bestaande gebruiker daar meteen een
-- Mandate-rij voor te hebben, op het niveau dat het addendum voor Martijn al
-- vastlegt (DEFAULT_LEVEL_BY_DOMAIN in domains.ts) — anders leest de app een
-- ontbrekende rij als "nog nooit ingesteld" (niveau 1, DEFAULT_MANDATE) voor
-- een domein dat in werkelijkheid al een afgesproken stand heeft.
--
-- Geen DDL: Mandate bestaat al sinds 20260807180000_mandates, met RLS erop
-- (tenant_isolation, FORCE ROW LEVEL SECURITY). Een kolom of tabel komt er
-- niet bij, dus er is hier geen nieuw beleid nodig — de aanmaakregel eronder
-- valt vanzelf onder het bestaande beleid op "Mandate".
--
-- ON CONFLICT DO NOTHING is de kern van "bestaande rijen niet overschrijven":
-- een gebruiker die zelf al een niveau koos (via Instellingen, de onboarding,
-- of de vorige migratie vanuit Connector.permission) houdt precies dat niveau.
-- Deze migratie vult alleen de gaten.
--
-- Handmatig geschreven (geen lokale db in deze omgeving — zie CLAUDE.md), maar
-- de VALUES-lijst hieronder is letterlijk DEFAULT_LEVEL_BY_DOMAIN uit
-- domains.ts overgetypt. Verandert die tabel later, dan verandert de SQL van
-- een migratie die al gedraaid heeft niet meer mee — zelfde afspraak als bij
-- deriveMandateFromPermission (zie de toelichting in derive.ts).
WITH default_level (domain, level) AS (
  VALUES
    ('calendar', 3),
    ('email_send', 2),
    ('email_triage', 3),
    ('payments', 2),
    ('finance_read', 3),
    ('messages', 2),
    ('commitments', 1),
    ('children', 1),
    ('documents', 3)
)
INSERT INTO "Mandate" (id, user_id, domain, level, rules, updated_at)
SELECT
  gen_random_uuid()::text,
  u.id,
  dl.domain,
  dl.level,
  '{}',
  now()
FROM "User" u
CROSS JOIN default_level dl
ON CONFLICT (user_id, domain) DO NOTHING;
