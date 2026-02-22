-- ═══════════════════════════════════════════════════════════════
-- P3: Onboarding Funnel Queries
-- Run in Supabase SQL Editor to analyse onboarding conversion.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Funnel overview: users reaching each step ─────────────
SELECT
  event_name,
  COUNT(DISTINCT user_id) AS users,
  ROUND(
    COUNT(DISTINCT user_id)::numeric /
    NULLIF((SELECT COUNT(DISTINCT user_id) FROM onboarding_events WHERE event_name = 'onboarding_started'), 0)
    * 100, 1
  ) AS pct_of_started
FROM onboarding_events
GROUP BY event_name
ORDER BY
  CASE event_name
    WHEN 'onboarding_started'   THEN 1
    WHEN 'services_completed'   THEN 2
    WHEN 'clusters_completed'   THEN 3
    WHEN 'quiz_started'         THEN 4
    WHEN 'quiz_completed'       THEN 5
    WHEN 'quiz_skipped'         THEN 6
    WHEN 'onboarding_completed' THEN 7
    WHEN 'first_home_view'      THEN 8
  END;

-- ── 2. Average durations ─────────────────────────────────────
-- Quiz duration (seconds)
SELECT
  ROUND(AVG((metadata->>'duration_seconds')::numeric), 1) AS avg_quiz_seconds,
  ROUND(MIN((metadata->>'duration_seconds')::numeric), 1) AS min_quiz_seconds,
  ROUND(MAX((metadata->>'duration_seconds')::numeric), 1) AS max_quiz_seconds,
  COUNT(*) AS completions
FROM onboarding_events
WHERE event_name = 'quiz_completed';

-- Total onboarding duration (seconds)
SELECT
  ROUND(AVG((metadata->>'total_duration_seconds')::numeric), 1) AS avg_total_seconds,
  ROUND(MIN((metadata->>'total_duration_seconds')::numeric), 1) AS min_total_seconds,
  ROUND(MAX((metadata->>'total_duration_seconds')::numeric), 1) AS max_total_seconds,
  COUNT(*) AS completions
FROM onboarding_events
WHERE event_name = 'onboarding_completed';

-- ── 3. Step-to-step drop-off ─────────────────────────────────
WITH steps AS (
  SELECT
    event_name,
    COUNT(DISTINCT user_id) AS users,
    CASE event_name
      WHEN 'onboarding_started'   THEN 1
      WHEN 'services_completed'   THEN 2
      WHEN 'clusters_completed'   THEN 3
      WHEN 'quiz_started'         THEN 4
      WHEN 'quiz_completed'       THEN 5
      WHEN 'onboarding_completed' THEN 6
    END AS step_order
  FROM onboarding_events
  WHERE event_name IN (
    'onboarding_started', 'services_completed', 'clusters_completed',
    'quiz_started', 'quiz_completed', 'onboarding_completed'
  )
  GROUP BY event_name
)
SELECT
  s.event_name,
  s.users,
  LAG(s.users) OVER (ORDER BY s.step_order) AS prev_step_users,
  ROUND(
    s.users::numeric /
    NULLIF(LAG(s.users) OVER (ORDER BY s.step_order), 0)
    * 100, 1
  ) AS step_conversion_pct,
  ROUND(
    (1 - s.users::numeric /
    NULLIF(LAG(s.users) OVER (ORDER BY s.step_order), 0))
    * 100, 1
  ) AS drop_off_pct
FROM steps s
WHERE s.step_order IS NOT NULL
ORDER BY s.step_order;
