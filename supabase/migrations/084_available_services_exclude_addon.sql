-- 084 — titles.available_services stops counting addon-tier rows (interim, IN-SC-004)
--
-- WHAT AN ADDON ROW IS. The vendor tags a streaming option `addon` when it
-- is reachable only through a paid channel sold inside a parent service:
-- Prime Video Channels (~85 in the UK — HBO Max, Paramount+, Discovery+,
-- MUBI, Hayu, Crunchyroll, MGM+, STUDIOCANAL, Lionsgate+ …), Apple TV
-- Channels (~50), and NOW's three passes. After the 2026-09-11 cleanup
-- walks `streaming_availability` holds ~18,000 such rows on Prime alone.
--
-- THE PROBLEM. `available_services` is derived from every row for the
-- title, so a film sold only through the HBO Max channel on Prime carries
-- `{prime}` and is filtered into For You and Home for every Prime
-- subscriber — most of whom do not hold that channel. The detail page and
-- search hits already exclude addon rows from "included"; the two derived
-- surfaces did not.
--
-- THE FIX, interim. Derive `available_services` from subscription, free,
-- rent and buy rows only. Rent/buy keep their existing (pre-2026) meaning
-- of "reachable on that service" — this migration changes ONE thing. The
-- proper model — channels as sub-entitlements of the parent service — is
-- the addon-entitlements brief (docs/strategy/briefs/addon-entitlements.md)
-- and will replace this predicate with a per-user one.
--
-- Three functions carry the predicate and must agree, or
-- count_available_services_drift() reports every affected title as drift:
-- the full rebuild, the per-key recompute the triggers call, and the drift
-- check itself. Same shape as 075/077; the trigger bodies are untouched.
--
-- Reversibility: re-run the three CREATE OR REPLACE bodies from 075
-- (without the stream_type predicate) and refresh_title_available_services().

CREATE OR REPLACE FUNCTION public.refresh_title_available_services()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_updated integer;
BEGIN
  WITH agg AS (
    SELECT sa.tmdb_id, sa.media_type,
           array_agg(DISTINCT sa.service_id ORDER BY sa.service_id) AS svcs
    FROM public.streaming_availability sa
    WHERE sa.stream_type <> 'addon'
    GROUP BY sa.tmdb_id, sa.media_type
  )
  UPDATE public.titles t
  SET available_services = COALESCE(a.svcs, '{}')
  FROM agg a
  WHERE t.tmdb_id = a.tmdb_id
    AND t.media_type = a.media_type
    AND t.available_services IS DISTINCT FROM COALESCE(a.svcs, '{}');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Titles whose non-addon availability disappeared entirely still need
  -- clearing; the join above cannot reach them.
  UPDATE public.titles t
  SET available_services = '{}'
  WHERE t.available_services <> '{}'
    AND NOT EXISTS (
      SELECT 1 FROM public.streaming_availability sa
      WHERE sa.tmdb_id = t.tmdb_id AND sa.media_type = t.media_type
        AND sa.stream_type <> 'addon'
    );

  RETURN v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recompute_title_available_services(
  p_tmdb_id    integer,
  p_media_type text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  UPDATE public.titles t
  SET available_services = COALESCE((
        SELECT array_agg(DISTINCT sa.service_id ORDER BY sa.service_id)
        FROM public.streaming_availability sa
        WHERE sa.tmdb_id = p_tmdb_id
          AND sa.media_type = p_media_type
          AND sa.stream_type <> 'addon'
      ), '{}')
  WHERE t.tmdb_id = p_tmdb_id
    AND t.media_type = p_media_type;
$function$;

CREATE OR REPLACE FUNCTION public.count_available_services_drift()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $function$
  SELECT count(*)
  FROM public.titles t
  LEFT JOIN (
    SELECT sa.tmdb_id, sa.media_type,
           array_agg(DISTINCT sa.service_id ORDER BY sa.service_id) AS svcs
    FROM public.streaming_availability sa
    WHERE sa.stream_type <> 'addon'
    GROUP BY sa.tmdb_id, sa.media_type
  ) a ON a.tmdb_id = t.tmdb_id AND a.media_type = t.media_type
  WHERE t.available_services IS DISTINCT FROM COALESCE(a.svcs, '{}');
$function$;

COMMENT ON COLUMN public.titles.available_services IS
  'B3: denormalised from streaming_availability (subscription/free/rent/buy '
  'rows — addon-tier rows excluded since 084), kept exact by '
  'trg_sync_title_available_services. Rebuild with '
  'refresh_title_available_services(); verify with '
  'count_available_services_drift().';

-- ── Re-derive every title under the new predicate ──────────────────
SELECT public.refresh_title_available_services();

-- ── Prove it, in the same transaction ──────────────────────────────
DO $$
DECLARE
  v_drift bigint;
BEGIN
  SELECT public.count_available_services_drift() INTO v_drift;
  IF v_drift <> 0 THEN
    RAISE EXCEPTION
      'available_services drift is % after refresh; expected 0', v_drift;
  END IF;
  RAISE NOTICE 'available_services drift: 0 — addon rows excluded and consistent';
END $$;
