-- ══════════════════════════════════════════════════════════════════
-- 079 — Search-term retention: 30-day raw text, indefinite aggregate
-- ══════════════════════════════════════════════════════════════════
--
-- Native started calling `emitSearch` (native/src/hooks/useSearchLogging.ts),
-- so `user_interactions` now carries `event_type = 'search'` rows whose
-- metadata holds free text the user typed. Free text is a different class of
-- data from a thumbs-up, and the recommendation
-- (docs/plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md
-- §5.4) handles that with retention on the FIELD rather than a separate table:
--
--   1. Nightly, roll every `search` row older than 30 days into
--      `search_terms_daily` — a per-day, per-term, per-mode count with NO
--      user column.
--   2. Then null `metadata.query` on those same rows. The ROW SURVIVES: the
--      taste recompute's search-attribution join
--      (src/lib/taste-v2/interactionUpdate.ts) reads only `created_at` and
--      `session_id`, and `mode` / `result_count` / `mood_key` are not free
--      text. Only the words the user typed go.
--
-- Retention is therefore "30 to 31 days" rather than exactly 30: the cutoff
-- is a whole day boundary so a single day is never split across two runs
-- (which would make the median un-mergeable). Stated as 30 days in the
-- privacy policy §7, which is the promise the shorter of the two keeps.
--
-- Pattern: migration 014's `card_impressions_rollup` — a pg_cron job that
-- aggregates before it discards, idempotent under re-run, ordered so the
-- aggregate is always written first.
--
-- Live-schema verification before writing this (remote `schema_migrations`
-- is not authoritative — see the Supabase migration-history caveat):
--   to_regclass('public.search_terms_daily')  → NULL   (not yet present)
--   to_regclass('public.user_interactions')   → present
--   cron.job                                  → 10 jobs, 03:00 UTC free
--   user_interactions `search` rows           → 0
--
-- Rollback: SELECT cron.unschedule('search_terms_rollup');
--           DROP TABLE public.search_terms_daily;
--   Nothing is lost that was not already discarded by design.

-- ──────────────────────────────────────────────────────────────────
-- search_terms_daily — the aggregate that outlives the raw text
-- ──────────────────────────────────────────────────────────────────
-- ⚠ PRIVACY / DRIFT-CHECK NOTE (read before adding a user column):
--   This table deliberately has NO user_id and no other column that links a
--   term to a person. That is the whole point of it — it is what lets the
--   counts be kept indefinitely while the raw text is discarded at 30 days.
--   Consequently it needs NO coverage in `delete_own_account` (042) and NO
--   coverage in `export_user_data` (043/061): there is nothing in here that
--   belongs to any individual to delete or to export. The IN-PX-54 drift
--   check should treat this table as intentionally out of scope rather than
--   as a gap. If anyone ever adds a user-identifying column, that exemption
--   dies with the change and both functions must be updated in the same PR.
CREATE TABLE IF NOT EXISTS public.search_terms_daily (
  day                 DATE    NOT NULL,
  -- lower-cased, trimmed, whitespace-collapsed (§5.4 normalisation).
  term_normalised     TEXT    NOT NULL,
  -- 'lookup' = typed by a user. 'semantic' = the app-authored mood phrase
  -- behind a preset tap, which is copy rather than user text — kept
  -- separable by mode so it never pollutes a count of what people type.
  mode                TEXT    NOT NULL,
  count               INTEGER NOT NULL,
  median_result_count NUMERIC,
  PRIMARY KEY (day, term_normalised, mode)
);

-- RLS on with no policies at all: deny-by-default for `anon` and
-- `authenticated`. Only the cron job (postgres) and service_role touch it.
-- There is no per-user slice of this table that would make a read policy
-- meaningful — see the note above.
ALTER TABLE public.search_terms_daily ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────
-- pg_cron: aggregate, THEN strip. 03:00 UTC (free slot; 01:00 and 02:00
-- belong to the card_impressions rollup and partman maintenance).
-- ──────────────────────────────────────────────────────────────────
-- Both statements live in one DO block so they are one transaction: the
-- text is never discarded unless its aggregate committed alongside.
-- Idempotent — a second run sees no rows, because the first run's UPDATE
-- removed exactly the rows its INSERT consumed.
SELECT cron.schedule(
  'search_terms_rollup',
  '0 3 * * *',
  $job$
  DO $rollup$
  DECLARE
    v_cutoff timestamptz := ((now() - interval '30 days')::date)::timestamp AT TIME ZONE 'UTC';
  BEGIN
    INSERT INTO public.search_terms_daily (day, term_normalised, mode, count, median_result_count)
    SELECT
      (i.created_at AT TIME ZONE 'UTC')::date,
      lower(btrim(regexp_replace(i.metadata->>'query', '\s+', ' ', 'g'))),
      COALESCE(i.metadata->>'mode', 'lookup'),
      count(*)::int,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY (i.metadata->>'result_count')::double precision
      )
    FROM public.user_interactions i
    WHERE i.event_type = 'search'
      AND i.created_at < v_cutoff
      -- Preset taps and filter applies carry `query: null` — they have no
      -- term, so they contribute nothing here and nothing is stripped
      -- from them below.
      AND i.metadata->>'query' IS NOT NULL
      AND btrim(i.metadata->>'query') <> ''
    GROUP BY 1, 2, 3
    ON CONFLICT (day, term_normalised, mode) DO UPDATE
      SET count               = EXCLUDED.count,
          median_result_count = EXCLUDED.median_result_count;

    UPDATE public.user_interactions
       SET metadata = jsonb_set(metadata, '{query}', 'null'::jsonb, true)
     WHERE event_type = 'search'
       AND created_at < v_cutoff
       AND metadata->>'query' IS NOT NULL;
  END;
  $rollup$;
  $job$
);

-- ──────────────────────────────────────────────────────────────────
-- Documentation comments
-- ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.search_terms_daily IS
  'Daily count of normalised search terms across all users. Deliberately has '
  'no user_id: it is the anonymous residue that survives the 30-day retention '
  'on the raw query text in user_interactions.metadata. Exempt from '
  'delete_own_account (042) and export_user_data (043/061) because it holds '
  'no personal data — if a user column is ever added, that exemption ends. '
  'Populated by the search_terms_rollup cron job at 03:00 UTC daily.';

COMMENT ON COLUMN public.search_terms_daily.median_result_count IS
  'Median result_count for this (day, term, mode). A term that routinely '
  'returns 0 is a retrieval gap to chase (recommendation §6).';
