-- ============================================
-- Phase E1.1: Data Quality — Cross-reference TMDb vs SA API
-- ============================================

-- Add tmdb_confirmed flag to streaming_availability.
-- Set to TRUE when TMDb watch/providers also reports the title
-- is available on that service. FALSE means SA API has it but
-- TMDb doesn't (or vice versa) — potential data quality issue.
ALTER TABLE streaming_availability
  ADD COLUMN IF NOT EXISTS tmdb_confirmed BOOLEAN DEFAULT FALSE;

-- ── Discrepancy views ────────────────────────────────────

-- Titles where SA API has availability but TMDb may not agree.
-- Useful for spotting stale or incorrect deep links.
CREATE OR REPLACE VIEW sa_unconfirmed_availability AS
SELECT
  t.title,
  t.tmdb_id,
  t.media_type,
  sa.service_id,
  sa.stream_type,
  sa.deep_link_url,
  sa.last_verified_at,
  t.popularity
FROM streaming_availability sa
JOIN titles t ON sa.tmdb_id = t.tmdb_id AND sa.media_type = t.media_type
WHERE sa.tmdb_confirmed = FALSE
  AND sa.stream_type IN ('subscription', 'free')
ORDER BY t.popularity DESC;

-- Per-service confirmation rates — how much SA API and TMDb agree.
CREATE OR REPLACE VIEW service_confirmation_rates AS
SELECT
  service_id,
  COUNT(*) AS total_entries,
  COUNT(*) FILTER (WHERE tmdb_confirmed = TRUE) AS confirmed,
  COUNT(*) FILTER (WHERE tmdb_confirmed = FALSE) AS unconfirmed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE tmdb_confirmed = TRUE) / NULLIF(COUNT(*), 0),
    1
  ) AS confirmation_pct
FROM streaming_availability
WHERE stream_type IN ('subscription', 'free')
GROUP BY service_id
ORDER BY confirmation_pct ASC;

-- Titles with the most user-reported availability issues.
-- Cross-references user reports (P4 epic) with SA API data.
-- Only useful if the availability_reports table exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'availability_reports') THEN
    EXECUTE '
      CREATE OR REPLACE VIEW reported_availability_issues AS
      SELECT
        t.title,
        ar.tmdb_id,
        ar.media_type,
        ar.service_id,
        ar.issue_type,
        COUNT(*) AS report_count,
        sa.deep_link_url,
        sa.last_verified_at
      FROM availability_reports ar
      JOIN titles t ON ar.tmdb_id = t.tmdb_id
      LEFT JOIN streaming_availability sa
        ON ar.tmdb_id = sa.tmdb_id
        AND ar.media_type = sa.media_type
        AND ar.service_id = sa.service_id
      GROUP BY t.title, ar.tmdb_id, ar.media_type, ar.service_id, ar.issue_type, sa.deep_link_url, sa.last_verified_at
      HAVING COUNT(*) >= 2
      ORDER BY report_count DESC
    ';
  END IF;
END $$;
