-- Capture the live definition of the personal public.watchlist table.
--
-- Read-only. The table predates the migration series, so no migration
-- creates it; this query is how its definition is recorded. First run
-- 2026-09-18 (Growth G2 H1); the result is the comment block at the top of
-- supabase/migrations/093_households.sql. Re-run before any session that
-- would touch the table (G2 never does: plan D1) and compare.
--
-- One row per fact: kind (column | constraint | index | policy | grant |
-- rls | trigger), name, definition.

SELECT 'column' AS kind, column_name AS name,
       format('#%s %s nullable=%s default=%s', ordinal_position, data_type, is_nullable, column_default) AS definition
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'watchlist'
UNION ALL
SELECT 'constraint', conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.watchlist'::regclass
UNION ALL
SELECT 'index', indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'watchlist'
UNION ALL
SELECT 'policy', policyname,
       format('%s %s TO %s USING (%s) WITH CHECK (%s)', permissive, cmd, roles::text, qual, with_check)
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'watchlist'
UNION ALL
SELECT 'grant', grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type)
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'watchlist'
 GROUP BY grantee
UNION ALL
SELECT 'rls', 'enabled=' || relrowsecurity::text, 'forced=' || relforcerowsecurity::text
  FROM pg_class
 WHERE oid = 'public.watchlist'::regclass
UNION ALL
SELECT 'trigger', tgname, pg_get_triggerdef(oid)
  FROM pg_trigger
 WHERE tgrelid = 'public.watchlist'::regclass AND NOT tgisinternal
ORDER BY 1, 2;
