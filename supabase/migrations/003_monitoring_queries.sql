-- ============================================
-- Monitoring views for sync health (Phase C1.1)
-- Run these in Supabase SQL Editor to check data freshness.
-- ============================================

-- Recent sync history
-- Usage: SELECT * FROM sync_history;
CREATE OR REPLACE VIEW sync_history AS
SELECT
  sync_type,
  source,
  status,
  titles_processed,
  titles_added,
  titles_updated,
  titles_removed,
  errors,
  started_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER AS duration_seconds
FROM sync_log
ORDER BY started_at DESC
LIMIT 20;

-- Data freshness overview
-- Usage: SELECT * FROM data_freshness;
CREATE OR REPLACE VIEW data_freshness AS
SELECT
  'titles' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE imdb_id IS NOT NULL) AS with_imdb_id,
  MIN(last_synced_at) AS oldest_record,
  MAX(last_synced_at) AS newest_record,
  COUNT(*) FILTER (WHERE last_synced_at > NOW() - INTERVAL '24 hours') AS fresh_24h,
  COUNT(*) FILTER (WHERE last_synced_at > NOW() - INTERVAL '7 days') AS fresh_7d
FROM titles
UNION ALL
SELECT
  'streaming_availability',
  COUNT(*),
  COUNT(*), -- all have SA API data
  MIN(last_verified_at),
  MAX(last_verified_at),
  COUNT(*) FILTER (WHERE last_verified_at > NOW() - INTERVAL '24 hours'),
  COUNT(*) FILTER (WHERE last_verified_at > NOW() - INTERVAL '7 days')
FROM streaming_availability;

-- Deep link coverage per service
-- Usage: SELECT * FROM deep_link_coverage;
CREATE OR REPLACE VIEW deep_link_coverage AS
SELECT
  service_id,
  COUNT(DISTINCT tmdb_id) AS titles_with_links,
  COUNT(*) AS total_links,
  COUNT(*) FILTER (WHERE stream_type = 'subscription') AS subscription_links,
  COUNT(*) FILTER (WHERE stream_type = 'free') AS free_links,
  COUNT(*) FILTER (WHERE stream_type IN ('rent', 'buy')) AS rent_buy_links,
  COUNT(*) FILTER (WHERE stream_type = 'addon') AS addon_links,
  COUNT(*) FILTER (WHERE expires_soon = TRUE) AS expiring_soon,
  MIN(last_verified_at) AS oldest_link,
  MAX(last_verified_at) AS newest_link
FROM streaming_availability
GROUP BY service_id
ORDER BY titles_with_links DESC;

-- OMDB ratings coverage
-- Usage: SELECT * FROM ratings_coverage;
CREATE OR REPLACE VIEW ratings_coverage AS
SELECT
  COUNT(*) AS total_titles,
  COUNT(*) FILTER (WHERE imdb_id IS NOT NULL) AS with_imdb_id,
  COUNT(*) FILTER (WHERE rt_score IS NOT NULL) AS with_rt_score,
  COUNT(*) FILTER (WHERE imdb_rating IS NOT NULL) AS with_imdb_rating,
  COUNT(*) FILTER (WHERE rt_score IS NULL AND imdb_id IS NOT NULL) AS missing_rt_with_imdb,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE rt_score IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE imdb_id IS NOT NULL), 0),
    1
  ) AS rt_coverage_pct
FROM titles;
