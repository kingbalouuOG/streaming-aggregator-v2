-- ============================================
-- C1.3: Automated data quality validation
-- SQL functions callable after each sync run.
-- ============================================

-- Titles with zero streaming availability (missing SA API data)
CREATE OR REPLACE FUNCTION check_titles_without_availability()
RETURNS TABLE (tmdb_id INTEGER, media_type TEXT, title TEXT, popularity NUMERIC) AS $$
  SELECT t.tmdb_id, t.media_type, t.title, t.popularity
  FROM titles t
  LEFT JOIN streaming_availability sa ON t.tmdb_id = sa.tmdb_id AND t.media_type = sa.media_type
  WHERE sa.tmdb_id IS NULL
    AND t.imdb_id IS NOT NULL
  ORDER BY t.popularity DESC
  LIMIT 100;
$$ LANGUAGE sql;

-- Orphaned availability rows (SA API data without matching title)
CREATE OR REPLACE FUNCTION check_orphaned_availability()
RETURNS TABLE (tmdb_id INTEGER, media_type TEXT, service_id TEXT, deep_link_url TEXT) AS $$
  SELECT sa.tmdb_id, sa.media_type, sa.service_id, sa.deep_link_url
  FROM streaming_availability sa
  LEFT JOIN titles t ON sa.tmdb_id = t.tmdb_id AND sa.media_type = t.media_type
  WHERE t.tmdb_id IS NULL
  LIMIT 100;
$$ LANGUAGE sql;

-- Stale availability (not verified in over 7 days)
CREATE OR REPLACE FUNCTION check_stale_availability()
RETURNS TABLE (
  service_id TEXT,
  stale_count BIGINT,
  oldest_verified TIMESTAMPTZ
) AS $$
  SELECT
    service_id,
    COUNT(*) AS stale_count,
    MIN(last_verified_at) AS oldest_verified
  FROM streaming_availability
  WHERE last_verified_at < NOW() - INTERVAL '7 days'
  GROUP BY service_id
  ORDER BY stale_count DESC;
$$ LANGUAGE sql;

-- Combined data quality summary (run after each sync)
CREATE OR REPLACE FUNCTION run_data_quality_check()
RETURNS TABLE (
  check_name TEXT,
  result_count BIGINT,
  details TEXT
) AS $$
  -- Titles without any availability
  SELECT
    'titles_without_availability' AS check_name,
    COUNT(*)::BIGINT AS result_count,
    'Titles with IMDb ID but no streaming_availability rows' AS details
  FROM titles t
  LEFT JOIN streaming_availability sa ON t.tmdb_id = sa.tmdb_id AND t.media_type = sa.media_type
  WHERE sa.tmdb_id IS NULL AND t.imdb_id IS NOT NULL

  UNION ALL

  -- Orphaned availability
  SELECT
    'orphaned_availability',
    COUNT(*)::BIGINT,
    'streaming_availability rows with no matching title'
  FROM streaming_availability sa
  LEFT JOIN titles t ON sa.tmdb_id = t.tmdb_id AND sa.media_type = t.media_type
  WHERE t.tmdb_id IS NULL

  UNION ALL

  -- Stale availability (>7 days)
  SELECT
    'stale_availability_7d',
    COUNT(*)::BIGINT,
    'Availability entries not verified in 7+ days'
  FROM streaming_availability
  WHERE last_verified_at < NOW() - INTERVAL '7 days'

  UNION ALL

  -- Unconfirmed by TMDb
  SELECT
    'tmdb_unconfirmed',
    COUNT(*)::BIGINT,
    'SA API entries not confirmed by TMDb watch/providers'
  FROM streaming_availability
  WHERE tmdb_confirmed = FALSE
    AND stream_type IN ('subscription', 'free');
$$ LANGUAGE sql;
