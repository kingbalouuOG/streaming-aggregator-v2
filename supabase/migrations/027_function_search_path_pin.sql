-- Migration 027: Pin search_path on user-defined functions
--
-- Supabase's linter flagged 10 functions as `function_search_path_mutable`.
-- When a function has no fixed search_path, a caller (or role default) can
-- redirect unqualified identifiers inside the function body to a malicious
-- same-named object in a different schema — a real risk for SECURITY
-- DEFINER functions (handle_new_user, delete_own_account), and a best
-- practice for the rest.
--
-- All these functions reference only public-schema objects (titles,
-- streaming_availability, profiles) and temp space, so pinning to
-- `public, pg_temp` satisfies the linter without changing behaviour.
-- `pg_temp` stays last so CTEs and temp tables still resolve normally.
--
-- match_titles_by_vector additionally uses pgvector operators/types;
-- pgvector is installed in `public` on this project, so `public` on
-- the path covers it too.

ALTER FUNCTION public.check_titles_without_availability()     SET search_path = public, pg_temp;
ALTER FUNCTION public.check_orphaned_availability()           SET search_path = public, pg_temp;
ALTER FUNCTION public.check_stale_availability()              SET search_path = public, pg_temp;
ALTER FUNCTION public.run_data_quality_check()                SET search_path = public, pg_temp;
ALTER FUNCTION public.get_stale_titles(integer)               SET search_path = public, pg_temp;
ALTER FUNCTION public.get_stale_availability(integer)         SET search_path = public, pg_temp;
ALTER FUNCTION public.get_stale_ratings(integer)              SET search_path = public, pg_temp;
ALTER FUNCTION public.match_titles_by_vector(vector, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()                       SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_own_account()                    SET search_path = public, pg_temp;
