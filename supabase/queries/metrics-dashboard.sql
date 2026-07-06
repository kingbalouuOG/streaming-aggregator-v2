-- ============================================================
-- Videx — Weekly metrics dashboard (H0 Stream A / roadmap 0.7)
-- Run in the Supabase SQL Editor. Powers the weekly measurement ritual.
--
-- Conventions
--  - Test accounts are excluded everywhere via profiles.is_test_user.
--  - Windows are literal intervals; edit the `interval '…'` to rebase.
--  - Impression→outcome correlation mirrors v_training_examples
--    (migration 045): same user + title (+ session where available), the
--    outcome at or after the impression.
--  - CAVEAT: card_impressions has no media_type, so impression↔interaction
--    joins are on content_id only — the same ~0.8% movie/TV collision
--    class documented for v_training_examples (IN-458). Fine at dashboard
--    altitude.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. Activation funnel (uses the A1 native funnel events)
-- ════════════════════════════════════════════════════════════

-- 1a. Users reaching each onboarding step, as a % of onboarding_started.
WITH funnel AS (
  SELECT e.event_name, e.user_id
  FROM onboarding_events e
  JOIN profiles p ON p.id = e.user_id AND p.is_test_user IS NOT TRUE
)
SELECT
  event_name,
  COUNT(DISTINCT user_id) AS users,
  ROUND(
    100.0 * COUNT(DISTINCT user_id)
    / NULLIF((SELECT COUNT(DISTINCT user_id) FROM funnel WHERE event_name = 'onboarding_started'), 0),
    1
  ) AS pct_of_started
FROM funnel
WHERE event_name IN (
  'onboarding_started', 'services_completed', 'clusters_completed',
  'onboarding_completed', 'first_home_view'
)
GROUP BY event_name
ORDER BY CASE event_name
  WHEN 'onboarding_started'   THEN 1
  WHEN 'services_completed'   THEN 2
  WHEN 'clusters_completed'   THEN 3
  WHEN 'onboarding_completed' THEN 4
  WHEN 'first_home_view'      THEN 5
END;

-- 1b. Onboarding completion time. NOTE: rows written before the A1 fix
-- logged total_duration_seconds = 0 — filtered out here so the average
-- reflects real durations only.
SELECT
  COUNT(*)                                                                              AS completions,
  ROUND(AVG((metadata->>'total_duration_seconds')::numeric), 1)                         AS avg_seconds,
  ROUND(percentile_cont(0.5) WITHIN GROUP (
    ORDER BY (metadata->>'total_duration_seconds')::numeric)::numeric, 1)               AS median_seconds
FROM onboarding_events
WHERE event_name = 'onboarding_completed'
  AND COALESCE((metadata->>'total_duration_seconds')::numeric, 0) > 0;


-- ════════════════════════════════════════════════════════════
-- 2. Tier-1 engagement metrics (rolling 30 days)
-- ════════════════════════════════════════════════════════════

-- 2a. Detail-view rate @10 + watchlist conversion @10 — of the cards shown
-- in the top 10 positions, the share that led to a same-session detail_view
-- / watchlist_add of that title at or after the impression.
WITH imp AS (
  SELECT i.id, i.user_id, i.content_id, i.session_id, i.shown_at
  FROM card_impressions i
  JOIN profiles p ON p.id = i.user_id AND p.is_test_user IS NOT TRUE
  WHERE i.position <= 10
    AND i.shown_at >= now() - interval '30 days'
),
scored AS (
  SELECT
    imp.id,
    EXISTS (
      SELECT 1 FROM user_interactions u
      WHERE u.user_id = imp.user_id AND u.content_id = imp.content_id
        AND u.session_id = imp.session_id
        AND u.event_type = 'detail_view'
        AND u.created_at >= imp.shown_at
    ) AS viewed,
    EXISTS (
      SELECT 1 FROM user_interactions u
      WHERE u.user_id = imp.user_id AND u.content_id = imp.content_id
        AND u.session_id = imp.session_id
        AND u.event_type = 'watchlist_add'
        AND u.created_at >= imp.shown_at
    ) AS watchlisted
  FROM imp
)
SELECT
  COUNT(*)                                                                 AS impressions_top10,
  ROUND(100.0 * COUNT(*) FILTER (WHERE viewed)      / NULLIF(COUNT(*), 0), 2) AS detail_view_rate_at10_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE watchlisted) / NULLIF(COUNT(*), 0), 2) AS watchlist_conversion_at10_pct
FROM scored;

-- 2b. Deep-link CTR — of titles whose detail page was viewed, the share
-- that produced a same-session click-out (deep_link_click at/after view).
WITH views AS (
  SELECT u.user_id, u.content_id, u.session_id, u.created_at AS viewed_at
  FROM user_interactions u
  JOIN profiles p ON p.id = u.user_id AND p.is_test_user IS NOT TRUE
  WHERE u.event_type = 'detail_view'
    AND u.created_at >= now() - interval '30 days'
)
SELECT
  COUNT(*) AS detail_views,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM user_interactions c
    WHERE c.user_id = v.user_id AND c.content_id = v.content_id
      AND c.session_id = v.session_id
      AND c.event_type = 'deep_link_click'
      AND c.created_at >= v.viewed_at
  )) AS views_with_clickout,
  ROUND(100.0 * COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM user_interactions c
    WHERE c.user_id = v.user_id AND c.content_id = v.content_id
      AND c.session_id = v.session_id
      AND c.event_type = 'deep_link_click'
      AND c.created_at >= v.viewed_at
  )) / NULLIF(COUNT(*), 0), 2) AS deep_link_ctr_pct
FROM views v;


-- ════════════════════════════════════════════════════════════
-- 3. Weekly Watch Decisions (WWD) — the north-star (rolling 7 days)
-- ════════════════════════════════════════════════════════════
--
-- A WWD is a click-out (deep_link_click) or a mark-watched (watched) that
-- follows genuine engagement with that title — an impression OR a
-- detail_view of the same title in the prior 7 days. That correlation
-- requirement is what "excluding bulk logging" means in practice: bulk /
-- onboarding / import writes have no preceding shown impression or detail
-- view, so they don't qualify. Counted as DISTINCT (user, title) so a
-- repeated tap on one title is one decision (consistent with the A4
-- taste-vector dedup rule).
WITH decisions AS (
  SELECT DISTINCT u.user_id, u.content_id, u.media_type, u.created_at AS decided_at
  FROM user_interactions u
  JOIN profiles p ON p.id = u.user_id AND p.is_test_user IS NOT TRUE
  WHERE u.event_type IN ('deep_link_click', 'watched')
    AND u.created_at >= now() - interval '7 days'
),
qualified AS (
  SELECT DISTINCT d.user_id, d.content_id, d.media_type
  FROM decisions d
  WHERE EXISTS (
      SELECT 1 FROM card_impressions i
      WHERE i.user_id = d.user_id AND i.content_id = d.content_id
        AND i.shown_at <= d.decided_at
        AND i.shown_at >= d.decided_at - interval '7 days'
    )
    OR EXISTS (
      SELECT 1 FROM user_interactions dv
      WHERE dv.user_id = d.user_id AND dv.content_id = d.content_id
        AND dv.media_type = d.media_type
        AND dv.event_type = 'detail_view'
        AND dv.created_at <= d.decided_at
        AND dv.created_at >= d.decided_at - interval '7 days'
    )
),
wau AS (
  SELECT COUNT(DISTINCT u.user_id) AS weekly_active_users
  FROM user_interactions u
  JOIN profiles p ON p.id = u.user_id AND p.is_test_user IS NOT TRUE
  WHERE u.created_at >= now() - interval '7 days'
)
SELECT
  (SELECT COUNT(*) FROM qualified)                        AS weekly_watch_decisions,
  (SELECT COUNT(DISTINCT user_id) FROM qualified)         AS deciding_users,
  (SELECT weekly_active_users FROM wau)                   AS weekly_active_users,
  ROUND(
    (SELECT COUNT(*) FROM qualified)::numeric
    / NULLIF((SELECT weekly_active_users FROM wau), 0),
    2
  )                                                        AS wwd_per_wau;


-- ════════════════════════════════════════════════════════════
-- 4. W1 / W4 cohort retention (by signup week)
-- ════════════════════════════════════════════════════════════
--
-- Cohort = signup week (profiles.created_at). Retained in week N = the
-- user had any interaction during that specific 7-day window after signup
-- (W1 = days 7–14, W4 = days 28–35). Only cohorts old enough to have a
-- full window contribute to that column's %.
WITH cohorts AS (
  SELECT p.id AS user_id,
         date_trunc('week', p.created_at) AS cohort_week,
         p.created_at AS signup_at
  FROM profiles p
  WHERE p.is_test_user IS NOT TRUE
)
SELECT
  c.cohort_week,
  COUNT(DISTINCT c.user_id) AS cohort_size,
  COUNT(DISTINCT c.user_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM user_interactions a
    WHERE a.user_id = c.user_id
      AND a.created_at >= c.signup_at + interval '7 days'
      AND a.created_at <  c.signup_at + interval '14 days'
  )) AS w1_retained,
  ROUND(100.0 * COUNT(DISTINCT c.user_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM user_interactions a
    WHERE a.user_id = c.user_id
      AND a.created_at >= c.signup_at + interval '7 days'
      AND a.created_at <  c.signup_at + interval '14 days'
  )) / NULLIF(COUNT(DISTINCT c.user_id), 0), 1) AS w1_pct,
  COUNT(DISTINCT c.user_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM user_interactions a
    WHERE a.user_id = c.user_id
      AND a.created_at >= c.signup_at + interval '28 days'
      AND a.created_at <  c.signup_at + interval '35 days'
  )) AS w4_retained,
  ROUND(100.0 * COUNT(DISTINCT c.user_id) FILTER (WHERE EXISTS (
    SELECT 1 FROM user_interactions a
    WHERE a.user_id = c.user_id
      AND a.created_at >= c.signup_at + interval '28 days'
      AND a.created_at <  c.signup_at + interval '35 days'
  )) / NULLIF(COUNT(DISTINCT c.user_id), 0), 1) AS w4_pct
FROM cohorts c
GROUP BY c.cohort_week
ORDER BY c.cohort_week DESC;
