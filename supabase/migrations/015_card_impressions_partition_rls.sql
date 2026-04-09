-- Migration 015: card_impressions partition RLS hardening
--
-- Background: Migration 014 enabled RLS on the card_impressions parent
-- table, but in Postgres, RLS does not propagate from a partitioned
-- parent to its child partitions. The parent's policies are evaluated
-- when queries route through the parent (the normal access path), but
-- if anything queries a child partition directly (e.g.
-- `SELECT * FROM card_impressions_p20260401`), no RLS is enforced.
--
-- This was caught by Joe's added Task 3 verification check
--   SELECT schemaname, tablename, rowsecurity
--     FROM pg_tables WHERE tablename LIKE 'card_impressions_p%';
-- which returned rowsecurity = false on every partition.
--
-- This migration fixes the gap two ways:
--   1. Creates a TEMPLATE TABLE (card_impressions_template) with RLS
--      enabled and the same policies as the parent. pg_partman v5 uses
--      the template to clone properties (including RLS state) onto
--      every NEW partition it creates.
--   2. ALTERs each EXISTING partition (created by migration 014's
--      premake=2 plus the default partition) to enable RLS and add
--      the per-user policies.
--
-- After this migration, the verification query above returns
-- rowsecurity = true for the parent and every partition, present and
-- future.
--
-- Phase 0 / Migration row 015. Added during Task 3 verification when
-- the partition RLS gap was detected — strict scope deviation from
-- the locked 012/013/014 plan, approved by Joe before apply.

-- ──────────────────────────────────────────────────────────────────
-- Template table — pg_partman v5 clones its properties onto new
-- partitions. The template lives in public alongside the parent.
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_impressions_template (LIKE card_impressions INCLUDING ALL);

ALTER TABLE card_impressions_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own impressions" ON card_impressions_template;
CREATE POLICY "Users can insert own impressions"
  ON card_impressions_template FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own impressions" ON card_impressions_template;
CREATE POLICY "Users can read own impressions"
  ON card_impressions_template FOR SELECT
  USING (auth.uid() = user_id);

-- Tell pg_partman to use the template for future partitions.
UPDATE part_config
   SET template_table = 'public.card_impressions_template'
 WHERE parent_table = 'public.card_impressions';

-- ──────────────────────────────────────────────────────────────────
-- Existing partitions: enable RLS + add policies on each one.
-- DO block iterates pg_inherits so we don't have to hardcode the
-- partition names (which depend on when migration 014 ran and
-- which months partman premade).
-- ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  partition_name text;
BEGIN
  FOR partition_name IN
    SELECT child.relname
      FROM pg_inherits
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
      JOIN pg_namespace n  ON child.relnamespace    = n.oid
     WHERE parent.relname = 'card_impressions'
       AND n.nspname = 'public'
  LOOP
    -- Enable RLS on the partition.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', partition_name);

    -- Drop-then-create policies so the migration is idempotent.
    EXECUTE format(
      'DROP POLICY IF EXISTS "Users can insert own impressions" ON public.%I',
      partition_name
    );
    EXECUTE format(
      'CREATE POLICY "Users can insert own impressions" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)',
      partition_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS "Users can read own impressions" ON public.%I',
      partition_name
    );
    EXECUTE format(
      'CREATE POLICY "Users can read own impressions" ON public.%I FOR SELECT USING (auth.uid() = user_id)',
      partition_name
    );
  END LOOP;
END $$;
