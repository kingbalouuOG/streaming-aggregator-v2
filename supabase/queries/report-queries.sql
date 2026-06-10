-- ============================================================
-- P4: Availability Report Dashboard Queries
-- Run in Supabase SQL Editor to review user-submitted reports
-- ============================================================

-- 1. Most reported titles (top 20, last 30 days)
-- Identifies which titles have the worst availability data
SELECT
  tmdb_id,
  media_type,
  COUNT(*) AS report_count,
  COUNT(DISTINCT user_id) AS unique_reporters,
  array_agg(DISTINCT service_id) AS reported_services,
  array_agg(DISTINCT report_type) AS report_types,
  MIN(created_at) AS first_reported,
  MAX(created_at) AS last_reported
FROM availability_reports
WHERE created_at >= now() - interval '30 days'
GROUP BY tmdb_id, media_type
ORDER BY report_count DESC
LIMIT 20;


-- 2. Daily report volume (last 30 days)
-- Tracks whether reporting is increasing/decreasing
SELECT
  DATE(created_at) AS report_date,
  COUNT(*) AS total_reports,
  COUNT(DISTINCT user_id) AS unique_reporters,
  COUNT(DISTINCT tmdb_id) AS unique_titles
FROM availability_reports
WHERE created_at >= now() - interval '30 days'
GROUP BY DATE(created_at)
ORDER BY report_date DESC;


-- 3. Reports grouped by streaming service
-- Identifies which platforms have the worst data quality
-- NULL service_id = user selected "All" (general report, no specific service)
SELECT
  COALESCE(service_id, '(all/unspecified)') AS service,
  COUNT(*) AS report_count,
  COUNT(DISTINCT tmdb_id) AS unique_titles_reported,
  COUNT(DISTINCT user_id) AS unique_reporters,
  ROUND(
    COUNT(*) FILTER (WHERE report_type = 'not_available') * 100.0 / COUNT(*),
    1
  ) AS pct_not_available,
  ROUND(
    COUNT(*) FILTER (WHERE report_type = 'wrong_service') * 100.0 / COUNT(*),
    1
  ) AS pct_wrong_service,
  ROUND(
    COUNT(*) FILTER (WHERE report_type = 'other') * 100.0 / COUNT(*),
    1
  ) AS pct_other
FROM availability_reports
WHERE created_at >= now() - interval '30 days'
GROUP BY service_id
ORDER BY report_count DESC;


-- 4. Recent reports with notes (for manual review)
-- Notes give qualitative context for what's wrong
SELECT
  id,
  tmdb_id,
  media_type,
  service_id,
  report_type,
  notes,
  created_at
FROM availability_reports
WHERE notes IS NOT NULL
  AND created_at >= now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 50;
