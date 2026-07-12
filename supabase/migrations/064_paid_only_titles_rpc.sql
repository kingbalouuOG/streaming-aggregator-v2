-- 064: paid_only_titles RPC — the "New to rent or buy" row, done in SQL.
--
-- Pre-launch review 2026-07-12 found two defects in the TypeScript
-- two-query shape (paidRow.ts):
--   1. The included-titles exclusion query had no limit and silently
--     truncated at PostgREST's 1000-row cap — dropped rows re-admitted
--     subscription-included titles to the row (the exact bug PR #70
--     fixed, returning dataset-size-dependently).
--   2. The candidate query took an UNORDERED .limit(600) over ~40K
--     rent/buy rows, so "newest" was sorted from an arbitrary sample.
-- One anti-join with ORDER BY release_date kills both.
--
-- Semantics (must match paidRow.ts docs): a title qualifies when it has
-- a rent/buy row on any of the user's services AND no subscription/free
-- row on any of them. 'addon' deliberately counts as PAID — a channel
-- add-on is another paywall, not something the user already has.
--
-- Reads only public catalogue tables → safe for anon/authenticated
-- (the native app calls it with the anon key; the Worker with
-- service_role).
--
-- Reversibility: DROP FUNCTION public.paid_only_titles(text[], integer);

CREATE OR REPLACE FUNCTION public.paid_only_titles(
  p_services text[],
  p_limit integer DEFAULT 54
)
RETURNS TABLE (tmdb_id integer, media_type text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
STABLE
AS $function$
  SELECT t.tmdb_id, t.media_type
  FROM public.titles t
  WHERE EXISTS (
      SELECT 1 FROM public.streaming_availability sa
      WHERE sa.tmdb_id = t.tmdb_id
        AND sa.media_type = t.media_type
        AND sa.service_id = ANY (p_services)
        AND sa.stream_type IN ('rent', 'buy')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.streaming_availability sa2
      WHERE sa2.tmdb_id = t.tmdb_id
        AND sa2.media_type = t.media_type
        AND sa2.service_id = ANY (p_services)
        AND sa2.stream_type IN ('subscription', 'free')
    )
  ORDER BY t.release_date DESC NULLS LAST
  LIMIT GREATEST(LEAST(p_limit, 200), 0);
$function$;

COMMENT ON FUNCTION public.paid_only_titles(text[], integer) IS
  'Newest titles available ONLY via rent/buy (never subscription/free) on '
  'the given services. Feeds the "New to rent or buy" row (paidRow.ts). '
  'addon counts as paid.';

GRANT EXECUTE ON FUNCTION public.paid_only_titles(text[], integer)
  TO anon, authenticated, service_role;
