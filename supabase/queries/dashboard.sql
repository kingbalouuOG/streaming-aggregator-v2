-- ============================================
-- Videx Content Sync Dashboard
-- Run in Supabase SQL Editor for a quick health check.
-- ============================================

-- 1. Last 5 sync runs
SELECT sync_type, source, status, titles_processed, titles_added, titles_updated, errors,
  started_at, completed_at,
  EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER AS seconds
FROM sync_log
ORDER BY started_at DESC
LIMIT 5;

-- 2. Data freshness
SELECT * FROM data_freshness;

-- 3. Deep link coverage per service
SELECT * FROM deep_link_coverage;

-- 4. Ratings coverage
SELECT * FROM ratings_coverage;

-- 5. Data quality checks
SELECT * FROM run_data_quality_check();
