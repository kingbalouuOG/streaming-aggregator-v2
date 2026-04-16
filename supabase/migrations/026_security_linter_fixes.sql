-- Migration 026: Resolve Supabase security advisor findings
--
-- Two classes of issue flagged by the database linter on 2026-04-13:
--
-- 1. security_definer_view (ERROR × 6)
--    Monitoring views from migrations 003 and 004 are owned by `postgres`,
--    so PostgREST runs them with the owner's privileges, bypassing RLS on
--    the underlying tables. Fix: flip each view to security_invoker so it
--    executes with the caller's role and RLS applies normally. Only
--    authenticated and service_role currently query these views, and the
--    underlying tables (titles, streaming_availability, sync_log) already
--    grant SELECT to both — no functional change, just a compliant owner.
--
-- 2. rls_disabled_in_public (ERROR × 3) + sensitive_columns_exposed (ERROR × 1)
--    pg_partman's own bookkeeping tables (part_config, part_config_sub)
--    and the template table create_parent() generated for card_impressions
--    (template_public_card_impressions) live in the `public` schema because
--    Supabase installs pg_partman there by default (see migration 014 header).
--    PostgREST therefore exposes them, and the linter flags them for missing
--    RLS — and the template table additionally contains a session_id column
--    it treats as sensitive. Fix: enable RLS with no policies, which denies
--    all anon/authenticated access while leaving the postgres/supabase_admin
--    roles that run partman maintenance unaffected (RLS is bypassed for
--    table owners and BYPASSRLS roles).
--
-- All changes are reversible: `ALTER VIEW ... SET (security_invoker=off)`
-- and `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` revert each step.

-- ── 1. Security-definer views → security-invoker ──────────

ALTER VIEW public.sync_history               SET (security_invoker = on);
ALTER VIEW public.data_freshness             SET (security_invoker = on);
ALTER VIEW public.deep_link_coverage         SET (security_invoker = on);
ALTER VIEW public.ratings_coverage           SET (security_invoker = on);
ALTER VIEW public.sa_unconfirmed_availability  SET (security_invoker = on);
ALTER VIEW public.service_confirmation_rates SET (security_invoker = on);

-- ── 2. pg_partman public-schema tables → RLS enabled, no policies ──

ALTER TABLE public.part_config                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_config_sub                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_public_card_impressions ENABLE ROW LEVEL SECURITY;
