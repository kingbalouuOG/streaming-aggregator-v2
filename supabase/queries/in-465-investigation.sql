-- Phase 5.5 C17 / IN-465: catalogue-sync gap investigation queries.
--
-- Read-only diagnostics for the streaming_availability → titles join
-- gap. At plan-time (2026-05-07) ~3,807 distinct tmdb_id rows existed
-- in streaming_availability with no matching titles row, heavily
-- Prime-skewed. C17 confirms the current count, distribution, and
-- service mix; results feed the C18 backfill script.
--
-- Run all four queries in Studio SQL Editor and paste results into
-- docs/v2/investigations/in-465-catalogue-sync-gap.md.

-- ── Q1 — current missing-count ───────────────────────────────────────
-- Drives the canonical missing_n for the C18 backfill script.

SELECT count(*) AS missing_n
FROM (
  SELECT DISTINCT sa.tmdb_id, sa.media_type
  FROM streaming_availability sa
  LEFT JOIN titles t
    ON t.tmdb_id = sa.tmdb_id AND t.media_type = sa.media_type
  WHERE t.tmdb_id IS NULL
) miss;

-- ── Q2 — missing-count by media_type ─────────────────────────────────
-- Splits movies vs TV. Backfill batching may need different rate-limit
-- handling per type (TMDb's /tv endpoint is slightly slower than /movie).

SELECT sa.media_type, count(*) AS missing_n
FROM (
  SELECT DISTINCT tmdb_id, media_type
  FROM streaming_availability sa
  LEFT JOIN titles t USING (tmdb_id, media_type)
  WHERE t.tmdb_id IS NULL
) sa
GROUP BY sa.media_type
ORDER BY missing_n DESC;

-- ── Q3 — missing-count by service ────────────────────────────────────
-- Confirms the Prime-skew hypothesis. Output drives the C17 write-up's
-- "where the gap is" finding and the C18 backfill-priority decision.
-- Note the GROUP BY uses sa.service_id, not the missing distinct list —
-- a single missing tmdb_id can appear in multiple service rows, so
-- per-service count reflects exposure not unique titles.

SELECT sa.service_id, count(DISTINCT sa.tmdb_id) AS missing_unique_titles
FROM streaming_availability sa
LEFT JOIN titles t
  ON t.tmdb_id = sa.tmdb_id AND t.media_type = sa.media_type
WHERE t.tmdb_id IS NULL
GROUP BY sa.service_id
ORDER BY missing_unique_titles DESC;

-- ── Q4 — sample 100 missing IDs for TMDb sampling ───────────────────
-- Output feeds the scripts/in-465-tmdb-sample.ts diagnostic — the TS
-- script fetches each from TMDb to characterise the year + genre +
-- popularity distribution of the missing set.

SELECT DISTINCT sa.tmdb_id, sa.media_type, sa.service_id
FROM streaming_availability sa
LEFT JOIN titles t
  ON t.tmdb_id = sa.tmdb_id AND t.media_type = sa.media_type
WHERE t.tmdb_id IS NULL
ORDER BY sa.tmdb_id  -- deterministic ordering for reproducibility
LIMIT 100;
