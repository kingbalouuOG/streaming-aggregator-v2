-- 085 — titles.available_services means "included with the subscription" (subscription + free only)
--
-- 084 removed addon-tier rows from the derivation. This removes rent and
-- buy rows too, so "on your services" — the filter behind For You, Home's
-- genre spotlights and every `available_services && '{…}'` query — means
-- what the app's framing promises: titles you can watch with what you
-- already pay for.
--
-- WHY NOW. Measured 2026-09-15 after the cleanup walks: of the 24,744
-- titles the list counted as "on Prime", only 11,309 are included with a
-- Prime subscription; 11,402 titles across the catalogue are reachable
-- only by renting or buying. The feed offered them to Prime subscribers
-- while the card chips (TMDb provider data) showed nothing — Joe's "Nick
-- and the Jade Tree" / "One Night Only" observation on device.
--
-- RENT AND BUY ARE NOT BURIED. Every surface that shows paid options reads
-- `streaming_availability` rows directly, not this column: the detail
-- page's "Rent or buy" tier (detailAdapter.rentalOptions), search hits'
-- "Rent from £x" label (cheapestRentBuy), and Home / For You's "New to
-- rent or buy" row (`paid_only_titles` RPC, which selects rent/buy rows
-- on the user's services with no subscription/free row anywhere). Joe's
-- weekend-rental use case is served by those; this column stops feeding
-- pay-per-title into the "included" rows. Verified 2026-09-15 before
-- writing this.
--
-- Same three functions as 084 carry the predicate and must agree, or the
-- drift check reports every rent/buy-only title as drift.
--
-- Reversibility: re-apply 084's bodies (addon-only exclusion) and refresh.

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
    WHERE sa.stream_type IN ('subscription', 'free')
    GROUP BY sa.tmdb_id, sa.media_type
  )
  UPDATE public.titles t
  SET available_services = COALESCE(a.svcs, '{}')
  FROM agg a
  WHERE t.tmdb_id = a.tmdb_id
    AND t.media_type = a.media_type
    AND t.available_services IS DISTINCT FROM COALESCE(a.svcs, '{}');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Titles with no included row left still need clearing; the join above
  -- cannot reach them.
  UPDATE public.titles t
  SET available_services = '{}'
  WHERE t.available_services <> '{}'
    AND NOT EXISTS (
      SELECT 1 FROM public.streaming_availability sa
      WHERE sa.tmdb_id = t.tmdb_id AND sa.media_type = t.media_type
        AND sa.stream_type IN ('subscription', 'free')
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
          AND sa.stream_type IN ('subscription', 'free')
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
    WHERE sa.stream_type IN ('subscription', 'free')
    GROUP BY sa.tmdb_id, sa.media_type
  ) a ON a.tmdb_id = t.tmdb_id AND a.media_type = t.media_type
  WHERE t.available_services IS DISTINCT FROM COALESCE(a.svcs, '{}');
$function$;

COMMENT ON COLUMN public.titles.available_services IS
  'B3: services on which the title is INCLUDED (subscription/free rows of '
  'streaming_availability; rent/buy excluded since 085, addon since 084). '
  'Kept exact by trg_sync_title_available_services. Rebuild with '
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
  RAISE NOTICE 'available_services drift: 0 — included-only and consistent';
END $$;
