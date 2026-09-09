-- 080: subscription_included_titles RPC — the "Free to watch" preset, on the
-- semantic path.
--
-- Closes parking-lot IN-SL-002. The `cost: 'free'` axis means "included in
-- something you already pay for, or genuinely free" (Joe, 2026-09-08). On the
-- /discover path that is one TMDb parameter
-- (`with_watch_monetization_types=flatrate|free|ads`). On the semantic path
-- there was no way to express it at all:
--
--   * `match_titles_by_vector` takes no filter arguments, so every constraint
--     is a post-filter over the returned candidate metadata.
--   * that metadata carries no availability at all, and
--   * `titles.available_services` (migration 075) aggregates EVERY stream
--     type, so a title that is rent-only on Apple looks identical to one
--     included with Netflix.
--
-- The free/paid distinction lives only in `streaming_availability.stream_type`.
-- This function is the stream_type-aware lookup the vector path needs: hand it
-- the candidate ids it just retrieved and the user's services, get back the
-- subset that is actually included. Scoped to the candidate set rather than
-- scanning the catalogue, so it stays an index lookup on idx_sa_lookup
-- (tmdb_id, media_type) — no new index is needed.
--
-- Semantics, matching paid_only_titles (064) so the two cannot disagree:
--   * 'subscription' and 'free' count as INCLUDED.
--   * 'rent', 'buy' and 'addon' count as PAID. A channel add-on is another
--     paywall, not something the user already has.
--   * an empty or NULL p_services means "any service". A user who has picked
--     no stack should see everything that is free somewhere, not an empty
--     grid — the alternative reads as a broken filter rather than an honest
--     one.
--
-- Reads only public catalogue tables → safe for anon/authenticated (the native
-- app calls it with the anon key; the Worker with service_role).
--
-- Reversibility: DROP FUNCTION public.subscription_included_titles(integer[], text[]);

CREATE OR REPLACE FUNCTION public.subscription_included_titles(
  p_tmdb_ids integer[],
  p_services text[] DEFAULT NULL
)
RETURNS TABLE (tmdb_id integer, media_type text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
STABLE
AS $function$
  SELECT DISTINCT sa.tmdb_id, sa.media_type
  FROM public.streaming_availability sa
  WHERE sa.tmdb_id = ANY (p_tmdb_ids)
    AND sa.stream_type IN ('subscription', 'free')
    AND (
      p_services IS NULL
      OR cardinality(p_services) = 0
      OR sa.service_id = ANY (p_services)
    );
$function$;

COMMENT ON FUNCTION public.subscription_included_titles(integer[], text[]) IS
  'Of the given (tmdb_id) candidates, those with a subscription or free row on '
  'the given services — i.e. watchable at no marginal cost. Empty/NULL '
  'p_services means any service. Backs the "Free to watch" preset on the '
  'semantic search path (recommendation 2026-09-08-002 §2.2); addon counts as '
  'paid, matching paid_only_titles.';

GRANT EXECUTE ON FUNCTION public.subscription_included_titles(integer[], text[])
  TO anon, authenticated, service_role;
