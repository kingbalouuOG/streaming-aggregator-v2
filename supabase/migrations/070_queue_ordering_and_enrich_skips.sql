-- ============================================
-- 070: relevance-ordered backfill queue (A3) + enrich skip-list
-- ============================================
--
-- Two changes, both about the head of a work queue.
--
-- ── A3: order the backfill queue by relevance, not tmdb_id ─────────
--
-- `list_missing_title_ids` has always been ORDER BY tmdb_id ASC. The
-- original complaint was that this puts dead low-ID stubs first — and that
-- specific problem is now GONE: measured 2026-08-26, zero rows below
-- tmdb_id 10000 remain in the gap. The skip-list (migration 063) plus two
-- daily chains drained the whole dead zone, recording 2,016 confirmed 404s.
--
-- What remains is the user-facing half of the argument, and it still
-- holds. The gap spans tmdb_id 11,035 to 26,522,482 with a median of
-- 190,566, so ascending order works through the catalogue oldest-first:
--
--   current head (tmdb_id ASC):  tmdb_id 11,035-12,278, mostly pre-2000
--   recency-ordered head:        250/250 became available in the last 30d
--                                (2026-08-31 .. 2026-09-24)
--
-- At 3,000 rows/day the entire queue drains in about a fortnight either
-- way — ordering does not change WHETHER a title is fetched, only WHEN.
-- But it decides whether users see this month's Netflix additions on day 1
-- or day 14, which for a pre-launch catalogue is the whole point.
--
-- COST, measured: 9ms -> 1,025ms per call. The ORDER BY forces a full
-- HashAggregate over the anti-join instead of streaming from
-- idx_sa_lookup in tmdb_id order. That is a 115x regression on this one
-- query, and it is worth it: 12 calls per chain = ~12s against a ~945s
-- run, i.e. 1.3% overhead. Do NOT call this in a loop tighter than that.
--
-- On future-dated availability: 548 rows carry an `available_since` in the
-- future, none beyond 90 days (furthest 2026-09-24). They sort to the very
-- top, which is correct — upcoming titles are exactly what a streaming app
-- wants to surface early — and the set is small and self-limiting.
--
-- Reversibility: re-apply migration 063's list_missing_title_ids body.

CREATE OR REPLACE FUNCTION public.list_missing_title_ids(p_limit integer DEFAULT 300)
RETURNS TABLE (tmdb_id integer, media_type text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $function$
  SELECT sa.tmdb_id, sa.media_type
  FROM public.streaming_availability sa
  LEFT JOIN public.titles t
    ON t.tmdb_id = sa.tmdb_id
   AND t.media_type = sa.media_type
  LEFT JOIN public.backfill_skips s
    ON s.tmdb_id = sa.tmdb_id
   AND s.media_type = sa.media_type
  WHERE t.tmdb_id IS NULL
    AND s.tmdb_id IS NULL
    AND sa.media_type IN ('movie', 'tv')
  -- GROUP BY replaces the old DISTINCT: a title can have many availability
  -- rows (one per service/stream type) and we want the most recent of them
  -- to decide its position.
  GROUP BY sa.tmdb_id, sa.media_type
  ORDER BY max(sa.available_since) DESC NULLS LAST, sa.tmdb_id DESC
  LIMIT GREATEST(p_limit, 0);
$function$;

COMMENT ON FUNCTION public.list_missing_title_ids(integer) IS
  'A3: (tmdb_id, media_type) pairs in streaming_availability with no '
  'joining titles row and no backfill_skips entry, most-recently-available '
  'first. ~1s per call (full aggregate) — call once per slice, never in a '
  'tight loop. service_role only.';

-- ── Enrich skip-list ───────────────────────────────────────────────
--
-- enrich-new-titles walks `WHERE keywords IS NULL ORDER BY id`. A title
-- TMDb 404s on is left with keywords NULL so a future run can retry it if
-- TMDb restores it — but nothing records the 404, so it stays at the head
-- of the queue and is re-fetched by EVERY SLICE, not merely every run.
--
-- Measured 2026-08-26: 8 dead rows, 7 slices, 56 wasted TMDb calls. Small
-- today. The reason to fix it now is the cliff, not the waste: if the dead
-- set ever exceeds SLICE_LIMIT (250), every slice fetches nothing but dead
-- rows, processes zero, trips the `madeNoProgress` guard, and the chain is
-- marked failed. The queue would be permanently wedged behind rows that
-- can never succeed.
--
-- This is the same failure the backfill hit on 2026-07-11 and fixed with
-- backfill_skips (migration 063). Same shape, same fix — kept as a column
-- rather than a second table so the work queue stays a single-table
-- predicate with no join.
--
-- Reversibility: UPDATE public.titles SET enrich_skipped_at = NULL;
--                ALTER TABLE public.titles DROP COLUMN enrich_skipped_at;
--                -- then restore the old index definition below.
ALTER TABLE public.titles
  ADD COLUMN IF NOT EXISTS enrich_skipped_at timestamptz;

COMMENT ON COLUMN public.titles.enrich_skipped_at IS
  'Set when enrich-new-titles got a confirmed TMDb 404 for this row. '
  'Excludes it from the enrichment queue so it cannot re-occupy the head '
  'of every slice. Set to NULL to force a re-check (e.g. if TMDb restores '
  'the title).';

-- The queue predicate gained a term, so the partial index has to match it
-- or it stops being used at all.
DROP INDEX IF EXISTS public.idx_titles_enrichment_queue;
CREATE INDEX idx_titles_enrichment_queue
  ON public.titles (id)
  WHERE keywords IS NULL AND enrich_skipped_at IS NULL;

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. The queue head is now recent rather than oldest-first.
--   SELECT min(a.available_since)::date AS oldest, max(a.available_since)::date AS newest
--   FROM public.list_missing_title_ids(250) m
--   JOIN public.streaming_availability a
--     ON a.tmdb_id = m.tmdb_id AND a.media_type = m.media_type;
--   -- expect a window within roughly the last month, not 1990s catalogue
--
--   -- 2. Cost is ~1s, not ~9ms. That is expected; see the note above.
--   EXPLAIN ANALYZE SELECT * FROM public.list_missing_title_ids(250);
--
--   -- 3. Column + matching index exist.
--   SELECT to_regclass('public.idx_titles_enrichment_queue');
--   SELECT count(*) FROM public.titles WHERE enrich_skipped_at IS NOT NULL;
--   -- 0 before the next enrich run; should settle near the dead-stub count
--
--   -- 4. After the next enrich chain, the wasted re-fetches should be gone:
--   --    chain_state->>'skipped' should be roughly the number of NEW 404s,
--   --    not (dead rows x slices).
--   SELECT chain_state->>'slices' AS slices, chain_state->>'skipped' AS skipped
--   FROM public.sync_log WHERE sync_type = 'enrich'
--   ORDER BY started_at DESC LIMIT 3;
