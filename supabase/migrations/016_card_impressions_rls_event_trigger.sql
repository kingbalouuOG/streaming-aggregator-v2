-- Migration 016: card_impressions partition RLS via event trigger
--                 (Task 3 followup, supersedes the 015 template approach
--                  for RLS propagation specifically)
--
-- ──────────────────────────────────────────────────────────────────
-- What this migration does
-- ──────────────────────────────────────────────────────────────────
-- Installs a Postgres event trigger that fires on every CREATE TABLE
-- in the database, filters to tables matching
-- `public.card_impressions_p%` or `public.card_impressions_default`,
-- and enables RLS + creates the two per-user policies on each match
-- inline with the DDL that created the partition. This closes the
-- RLS gap on partitions that pg_partman creates via either its
-- automatic daily maintenance (02:00 UTC pg_cron job from migration
-- 014) or manual `create_partition_time()` calls.
--
-- ──────────────────────────────────────────────────────────────────
-- Why this migration exists (narrative — please read)
-- ──────────────────────────────────────────────────────────────────
-- Migration 015 attempted to solve partition RLS by configuring a
-- `template_table` via pg_partman v5's part_config. The assumption —
-- based on a misreading of the pg_partman v5 docs — was that the
-- template's properties (including RLS state and policies) would be
-- cloned onto every new partition.
--
-- This was empirically wrong. Task 3 verification on 2026-04-09
-- found that after 015 applied successfully:
--   - The parent, the template, and every pre-existing partition
--     correctly showed rowsecurity = true with the two policies.
--   - Calling create_partition_time('public.card_impressions',
--     ARRAY['2026-08-01'::timestamptz]) created a new partition with
--     rowsecurity = false and zero policies.
--   - Setting part_config.inherit_privileges = true (tested as a
--     second theory) did not help either — inherit_privileges covers
--     GRANT-style privileges only, not RLS.
--
-- pg_partman's template_table mechanism propagates things that
-- Postgres itself does not auto-propagate from a partitioned parent:
-- UNIQUE / CHECK constraints and CLUSTER index settings. RLS state
-- is not one of them.
--
-- See the KNOWN LIMITATION block in migration 015 for the full detail.
-- Migration 015 remains required because (a) its DO block is the
-- only thing that fixed the pre-existing partitions at apply time
-- and (b) the template is still useful for constraint propagation.
-- This migration (016) closes the remaining gap for future partitions.
--
-- ──────────────────────────────────────────────────────────────────
-- Why an event trigger specifically
-- ──────────────────────────────────────────────────────────────────
-- Three fix options were considered: (A) event trigger on
-- ddl_command_end, (B) a secondary pg_cron cleanup job, (C) a wrapper
-- procedure replacing the pg_partman_maintenance cron job. Options B
-- and C both have a non-zero exposure window between partition
-- creation and RLS being applied — small in practice, because
-- partitions are created via premake proactively and don't receive
-- data immediately, but not zero. Only option A gives zero exposure
-- for both normal cron-driven partition creation AND manual
-- create_partition_time calls, because the trigger fires synchronously
-- with the CREATE TABLE statement inside the same transaction.
--
-- Option A's viability on Supabase was empirically verified via a
-- BEGIN/ROLLBACK permission probe on 2026-04-09 — CREATE EVENT TRIGGER
-- runs cleanly under the postgres role that migrations execute as.
--
-- ──────────────────────────────────────────────────────────────────
-- Discoverability note
-- ──────────────────────────────────────────────────────────────────
-- If you are debugging something like "why does my newly-created
-- card_impressions partition have RLS policies I didn't write," the
-- answer lives in this file. Grep the migrations directory for
-- `card_impressions` and this migration will come up. The trigger
-- itself is visible in pg_event_trigger under the name
-- `card_impressions_rls_on_create` — query that view if you ever
-- need to confirm it is still installed.
--
-- ──────────────────────────────────────────────────────────────────
-- Idempotency notes
-- ──────────────────────────────────────────────────────────────────
-- The migration uses DROP EVENT TRIGGER IF EXISTS + CREATE OR REPLACE
-- FUNCTION so re-running it is safe. The trigger function itself uses
-- DROP POLICY IF EXISTS before each CREATE POLICY and handles RLS
-- being already enabled, so re-firing it on an already-protected
-- partition is a no-op.
--
-- ──────────────────────────────────────────────────────────────────
-- Defensive behaviour: failure logs a WARNING but does not abort DDL
-- ──────────────────────────────────────────────────────────────────
-- The per-partition work is wrapped in BEGIN ... EXCEPTION WHEN OTHERS
-- THEN RAISE WARNING. If the RLS application fails for any reason
-- (unexpected permissions issue, schema drift, etc.), the trigger
-- logs a loud warning to the Postgres log (visible in the Supabase
-- dashboard logs) with the partition name and SQLERRM, but does NOT
-- propagate the exception — the CREATE TABLE that fired the trigger
-- still succeeds. This fails open rather than blocking partition
-- creation, which is the right tradeoff because a blocked partition
-- creation would break the daily partman maintenance cron and cascade
-- into real operational pain.
--
-- If you see these warnings in the logs, investigate immediately —
-- they indicate new partitions without RLS are landing in production.
--
-- ──────────────────────────────────────────────────────────────────
-- Field names used below were empirically verified on 2026-04-09 by
-- installing a throwaway probe trigger inside a transaction and
-- inspecting the pg_event_trigger_ddl_commands() row for a CREATE
-- TABLE command. Confirmed values: command_tag='CREATE TABLE',
-- object_type='table', schema_name='public', object_identity=
-- 'public.<table_name>' (schema-qualified).
-- ──────────────────────────────────────────────────────────────────

-- SECURITY DEFINER so the function always runs with postgres
-- permissions regardless of who fired the underlying CREATE TABLE.
-- This matters if anyone ever creates a card_impressions partition
-- from a non-postgres role (service_role session, a migration run
-- under a different user, etc.) — the RLS enablement still works.
--
-- `SET search_path = public, pg_catalog` is standard hardening for
-- SECURITY DEFINER functions — it prevents search-path injection
-- attacks where someone creates a malicious object in a schema
-- earlier in the path and hijacks unqualified references.
CREATE OR REPLACE FUNCTION card_impressions_ensure_rls()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  obj             record;
  partition_name  text;
BEGIN
  FOR obj IN
    SELECT command_tag, object_type, schema_name, object_identity, in_extension
      FROM pg_event_trigger_ddl_commands()
  LOOP
    -- Defensive filter: bail out on anything that is not a CREATE TABLE
    -- in public matching one of the card_impressions partition name
    -- patterns. Each condition is checked independently so a table
    -- named `card_impressions_partner_data` in another schema cannot
    -- accidentally match.
    IF obj.command_tag IS DISTINCT FROM 'CREATE TABLE' THEN
      CONTINUE;
    END IF;
    IF obj.object_type IS DISTINCT FROM 'table' THEN
      CONTINUE;
    END IF;
    IF obj.schema_name IS DISTINCT FROM 'public' THEN
      CONTINUE;
    END IF;
    IF obj.in_extension THEN
      CONTINUE;
    END IF;
    IF obj.object_identity NOT LIKE 'public.card_impressions_p%'
       AND obj.object_identity IS DISTINCT FROM 'public.card_impressions_default' THEN
      CONTINUE;
    END IF;

    -- Strip the 'public.' schema prefix to get the bare relation name
    -- for format(%I) quoting. Length of 'public.' is 7.
    partition_name := substring(obj.object_identity FROM 8);

    -- Apply RLS + policies. Wrap in an exception handler so a failure
    -- on one partition does not propagate back to the firing DDL and
    -- does not abort processing of other records in the same event
    -- trigger invocation.
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
        partition_name
      );

      EXECUTE format(
        'DROP POLICY IF EXISTS "Users can insert own impressions" ON public.%I',
        partition_name
      );
      EXECUTE format(
        'CREATE POLICY "Users can insert own impressions" ON public.%I '
        'FOR INSERT WITH CHECK (auth.uid() = user_id)',
        partition_name
      );

      EXECUTE format(
        'DROP POLICY IF EXISTS "Users can read own impressions" ON public.%I',
        partition_name
      );
      EXECUTE format(
        'CREATE POLICY "Users can read own impressions" ON public.%I '
        'FOR SELECT USING (auth.uid() = user_id)',
        partition_name
      );
    EXCEPTION WHEN OTHERS THEN
      -- Loud but non-destructive. The CREATE TABLE that triggered us
      -- still succeeds; an operator sees a WARNING in the Postgres
      -- log and can investigate.
      RAISE WARNING 'card_impressions_ensure_rls failed on partition %: %',
        partition_name, SQLERRM;
    END;
  END LOOP;
END;
$fn$;

-- Pin ownership to postgres explicitly. On Supabase this is a no-op
-- when the migration runs as postgres (functions are created owned
-- by their creator by default), but being explicit documents the
-- intent and protects against a migration framework ever running
-- CREATE FUNCTION as a different role.
ALTER FUNCTION card_impressions_ensure_rls() OWNER TO postgres;

-- SECURITY DEFINER hardening: Postgres defaults CREATE FUNCTION to
-- GRANT EXECUTE ... TO PUBLIC, which would let any role call this
-- function directly (not just have it fire via the event trigger).
-- A direct call outside an event trigger context would fail anyway
-- because pg_event_trigger_ddl_commands() only returns rows when
-- called from within an event trigger, but as a defense-in-depth
-- measure we revoke EXECUTE so only postgres can invoke it.
REVOKE EXECUTE ON FUNCTION card_impressions_ensure_rls() FROM PUBLIC;

-- Install the event trigger. Drop-then-create so the migration is
-- idempotent if ever re-applied.
DROP EVENT TRIGGER IF EXISTS card_impressions_rls_on_create;

CREATE EVENT TRIGGER card_impressions_rls_on_create
  ON ddl_command_end
  EXECUTE FUNCTION card_impressions_ensure_rls();

COMMENT ON FUNCTION card_impressions_ensure_rls() IS
  'Phase 0 / Migration 016. Event trigger function that enables RLS + per-user policies on newly-created card_impressions_* partitions. Runs as SECURITY DEFINER owned by postgres. Failures log a WARNING but do not abort the firing DDL. See migration 016 header for full context.';

COMMENT ON EVENT TRIGGER card_impressions_rls_on_create IS
  'Phase 0 / Migration 016. Fires on every CREATE TABLE, filters to card_impressions_* partitions, and calls card_impressions_ensure_rls() to apply RLS + policies.';
