-- ============================================================
-- Videx — Growth dashboard (Growth S2 / G0-6; plan
-- docs/plans/2026-09-14-003 §4 G0-6, §5 G1-4)
-- Run in the Supabase SQL Editor. Reads growth_events (migration 090),
-- user_interactions, onboarding_events, notification_deliveries (057) and
-- profiles. Sharing and notification measures (§1, §6) from Growth S4.
--
-- Conventions
--  - Test accounts are excluded via profiles.is_test_user. growth_events
--    rows written before sign-up have no user_id, so a test install is any
--    install id that ever carried a test user's id (test_installs below).
--  - Page events (preview_fetched / preview_opened) are anonymous: no
--    install id and no user id, so test traffic cannot be excluded there.
--  - first_open rows with metadata.prior_install = 'true' are updates from
--    a build without attribution, not new installs; the install funnel
--    leaves them out (IN-GR-006).
--  - via = URL channel (share | push | seo | card | household); src = the
--    session a share started in (push | organic). '(none)' = no attribution.
--  - Windows are literal intervals; edit the `interval '…'` to rebase.
--
-- Deterministic vs inferred
--  - ANDROID open-to-install is DETERMINISTIC. A page's Play link carries
--    via / src and the object in the install referrer; the app's first_open
--    then reports metadata.touch = 'install_referrer' with that via and
--    object.
--  - iOS has no install referrer and no probabilistic matching (plan D9).
--    An iOS first_open carries a touch only when a Videx link was opened in
--    the app (metadata.touch = 'link'), so iOS open-to-install is INFERRED:
--    iOS page opens per via against iOS first opens per via over the same
--    window (§3c), not a join of one person's steps.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. Shares per weekly active user (last 8 ISO weeks)
-- ════════════════════════════════════════════════════════════
--
-- SOURCE: growth_events.share_initiated (Growth S4), written when the share
-- sheet opens on both platforms, titles and rooms alike. Shares made signed
-- out carry no user id; they count as shares but not as sharing users. Test
-- installs are excluded as in §3.
-- WAU = any user_interactions row that week (as metrics-dashboard §3).
WITH weeks AS (
  SELECT generate_series(
           date_trunc('week', now()) - interval '7 weeks',
           date_trunc('week', now()),
           interval '1 week'
         ) AS week
),
active AS (
  SELECT date_trunc('week', u.created_at) AS week, COUNT(DISTINCT u.user_id) AS wau
  FROM user_interactions u
  JOIN profiles p ON p.id = u.user_id AND p.is_test_user IS NOT TRUE
  WHERE u.created_at >= date_trunc('week', now()) - interval '7 weeks'
  GROUP BY 1
),
test_installs AS (
  SELECT DISTINCT g.install_id
  FROM growth_events g
  JOIN profiles p ON p.id = g.user_id AND p.is_test_user IS TRUE
  WHERE g.install_id IS NOT NULL
),
shares AS (
  SELECT date_trunc('week', g.occurred_at) AS week,
         COUNT(*)                  AS shares,
         COUNT(DISTINCT g.user_id) AS sharing_users
  FROM growth_events g
  WHERE g.event_name = 'share_initiated'
    AND g.occurred_at >= date_trunc('week', now()) - interval '7 weeks'
    AND g.install_id NOT IN (SELECT install_id FROM test_installs)
  GROUP BY 1
)
-- Pre-S4 `shares`, kept while builds without share_initiated are in use
-- (user_interactions.share fires after the sheet resolves, titles only, and
-- on Android a dismissed sheet also counts):
--   shares AS (
--     SELECT date_trunc('week', u.created_at) AS week,
--            COUNT(*) AS shares, COUNT(DISTINCT u.user_id) AS sharing_users
--     FROM user_interactions u
--     JOIN profiles p ON p.id = u.user_id AND p.is_test_user IS NOT TRUE
--     WHERE u.event_type = 'share'
--       AND u.created_at >= date_trunc('week', now()) - interval '7 weeks'
--     GROUP BY 1
--   )
SELECT
  w.week,
  COALESCE(a.wau, 0)            AS weekly_active_users,
  COALESCE(s.shares, 0)         AS shares,
  COALESCE(s.sharing_users, 0)  AS sharing_users,
  ROUND(COALESCE(s.shares, 0)::numeric / NULLIF(a.wau, 0), 3) AS shares_per_wau
FROM weeks w
LEFT JOIN active a ON a.week = w.week
LEFT JOIN shares s ON s.week = w.week
ORDER BY w.week DESC;


-- ════════════════════════════════════════════════════════════
-- 2. Previews fetched vs pages opened (last 30 days)
-- ════════════════════════════════════════════════════════════
--
-- preview_fetched = a crawler unfurled the link (a chat preview was built);
-- preview_opened = a person opened the page. Recorded on every served GET
-- 200 of /t/ and /room/, cache hits included. Reloads count (IN-GR-007).

-- 2a. By object and via (top 50 by opens).
SELECT
  g.object_type,
  g.object_id,
  COALESCE(g.via, '(none)')                                      AS via,
  COUNT(*) FILTER (WHERE g.event_name = 'preview_fetched')       AS previews_fetched,
  COUNT(*) FILTER (WHERE g.event_name = 'preview_opened')        AS page_opens,
  ROUND(
    COUNT(*) FILTER (WHERE g.event_name = 'preview_opened')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE g.event_name = 'preview_fetched'), 0),
    2
  )                                                              AS opens_per_preview
FROM growth_events g
WHERE g.event_name IN ('preview_fetched', 'preview_opened')
  AND g.occurred_at >= now() - interval '30 days'
GROUP BY 1, 2, 3
ORDER BY page_opens DESC, previews_fetched DESC
LIMIT 50;

-- 2b. By via and the visitor's platform bucket (ios | android | other).
SELECT
  COALESCE(g.via, '(none)')                                      AS via,
  g.platform,
  COUNT(*) FILTER (WHERE g.event_name = 'preview_fetched')       AS previews_fetched,
  COUNT(*) FILTER (WHERE g.event_name = 'preview_opened')        AS page_opens
FROM growth_events g
WHERE g.event_name IN ('preview_fetched', 'preview_opened')
  AND g.occurred_at >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY 1, 2;

-- 2c. Which crawlers unfurled links.
SELECT
  COALESCE(g.metadata->>'agent', '(unknown)') AS agent,
  COUNT(*)                                    AS previews_fetched
FROM growth_events g
WHERE g.event_name = 'preview_fetched'
  AND g.occurred_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 2 DESC;


-- ════════════════════════════════════════════════════════════
-- 3. link_opened → first_open → signup_completed
-- ════════════════════════════════════════════════════════════

-- 3a. Install funnel by first-touch via, platform and touch source.
-- Cohort = installs whose first_open landed in the last 30 days. via is the
-- first touch that first_open carried; link_opened can come before or after
-- first_open (on iOS the user taps the link again once installed).
WITH test_installs AS (
  SELECT DISTINCT g.install_id
  FROM growth_events g
  JOIN profiles p ON p.id = g.user_id AND p.is_test_user IS TRUE
  WHERE g.install_id IS NOT NULL
),
installs AS (
  SELECT
    g.install_id,
    MIN(g.occurred_at) FILTER (WHERE g.event_name = 'first_open')                                     AS first_open_at,
    (array_agg(g.via ORDER BY g.occurred_at) FILTER (WHERE g.event_name = 'first_open'))[1]            AS via,
    (array_agg(g.platform ORDER BY g.occurred_at) FILTER (WHERE g.event_name = 'first_open'))[1]       AS platform,
    (array_agg(g.metadata->>'touch' ORDER BY g.occurred_at) FILTER (WHERE g.event_name = 'first_open'))[1] AS touch,
    bool_or(g.event_name = 'first_open' AND g.metadata->>'prior_install' = 'true')                    AS prior_install,
    bool_or(g.event_name = 'link_opened')                                                              AS opened_link,
    bool_or(g.event_name = 'signup_completed')                                                         AS signed_up
  FROM growth_events g
  WHERE g.install_id IS NOT NULL
    AND g.install_id NOT IN (SELECT install_id FROM test_installs)
  GROUP BY g.install_id
)
SELECT
  COALESCE(via, '(none)')                                                   AS first_touch_via,
  platform,
  COALESCE(touch, '(none)')                                                 AS touch,
  COUNT(*) FILTER (WHERE opened_link)                                       AS installs_that_opened_a_link,
  COUNT(*)                                                                  AS first_opens,
  COUNT(*) FILTER (WHERE signed_up)                                         AS signups,
  ROUND(100.0 * COUNT(*) FILTER (WHERE signed_up) / NULLIF(COUNT(*), 0), 1) AS signup_pct
FROM installs
WHERE first_open_at >= now() - interval '30 days'
  AND prior_install IS NOT TRUE
GROUP BY 1, 2, 3
ORDER BY first_opens DESC;

-- 3b. Links opened in the app, by via, platform and object type (all
-- installs, existing users included).
SELECT
  COALESCE(g.via, '(none)')      AS via,
  COALESCE(g.src, '(none)')      AS src,
  g.platform,
  g.object_type,
  COUNT(*)                       AS link_opens,
  COUNT(DISTINCT g.install_id)   AS installs,
  COUNT(DISTINCT g.user_id)      AS signed_in_users
FROM growth_events g
WHERE g.event_name = 'link_opened'
  AND g.occurred_at >= now() - interval '30 days'
GROUP BY 1, 2, 3, 4
ORDER BY link_opens DESC;

-- 3c. Open-to-install by via: page opens on a phone vs attributed first
-- opens on that platform, last 30 days. Android counts only
-- install_referrer touches (deterministic); iOS counts link touches
-- (inferred: a person who installs from the page and never opens a Videx
-- link afterwards is invisible here).
WITH test_installs AS (
  SELECT DISTINCT g.install_id
  FROM growth_events g
  JOIN profiles p ON p.id = g.user_id AND p.is_test_user IS TRUE
  WHERE g.install_id IS NOT NULL
),
page_opens AS (
  SELECT COALESCE(g.via, '(none)') AS via, g.platform, COUNT(*) AS page_opens
  FROM growth_events g
  WHERE g.event_name = 'preview_opened'
    AND g.platform IN ('android', 'ios')
    AND g.occurred_at >= now() - interval '30 days'
  GROUP BY 1, 2
),
attributed_installs AS (
  SELECT COALESCE(g.via, '(none)') AS via, g.platform, COUNT(*) AS installs
  FROM growth_events g
  WHERE g.event_name = 'first_open'
    AND g.occurred_at >= now() - interval '30 days'
    AND COALESCE(g.metadata->>'prior_install', 'false') <> 'true'
    AND g.install_id NOT IN (SELECT install_id FROM test_installs)
    AND (
      (g.platform = 'android' AND g.metadata->>'touch' = 'install_referrer')
      OR (g.platform = 'ios' AND g.metadata->>'touch' = 'link')
    )
  GROUP BY 1, 2
)
SELECT
  COALESCE(p.via, i.via)                                        AS via,
  COALESCE(p.platform, i.platform)                              AS platform,
  CASE COALESCE(p.platform, i.platform)
    WHEN 'android' THEN 'deterministic (install referrer)'
    ELSE 'inferred (no install referrer on iOS)'
  END                                                           AS method,
  COALESCE(p.page_opens, 0)                                     AS page_opens,
  COALESCE(i.installs, 0)                                       AS attributed_installs,
  ROUND(COALESCE(i.installs, 0)::numeric / NULLIF(p.page_opens, 0), 3) AS installs_per_page_open
FROM page_opens p
FULL JOIN attributed_installs i ON i.via = p.via AND i.platform = p.platform
ORDER BY 2, 4 DESC;


-- ════════════════════════════════════════════════════════════
-- 4. D7 / D30 retention by first-touch via
-- ════════════════════════════════════════════════════════════
--
-- Cohort = users with a signup_completed row; via = the first touch it
-- carries; sign-up time = profiles.created_at. Retained at D7 = any
-- user_interactions row in days 7–13 after sign-up; D30 = days 30–36
-- (week-long windows, as metrics-dashboard §4). Only users old enough for a
-- window count toward its percentage.
WITH signups AS (
  SELECT DISTINCT ON (g.user_id)
    g.user_id,
    COALESCE(g.via, '(none)') AS via,
    p.created_at              AS signup_at
  FROM growth_events g
  JOIN profiles p ON p.id = g.user_id AND p.is_test_user IS NOT TRUE
  WHERE g.event_name = 'signup_completed'
  ORDER BY g.user_id, g.occurred_at
),
flags AS (
  SELECT
    s.via,
    s.signup_at <= now() - interval '14 days' AS d7_eligible,
    s.signup_at <= now() - interval '37 days' AS d30_eligible,
    EXISTS (
      SELECT 1 FROM user_interactions a
      WHERE a.user_id = s.user_id
        AND a.created_at >= s.signup_at + interval '7 days'
        AND a.created_at <  s.signup_at + interval '14 days'
    ) AS d7_retained,
    EXISTS (
      SELECT 1 FROM user_interactions a
      WHERE a.user_id = s.user_id
        AND a.created_at >= s.signup_at + interval '30 days'
        AND a.created_at <  s.signup_at + interval '37 days'
    ) AS d30_retained
  FROM signups s
)
SELECT
  via,
  COUNT(*)                                                        AS signups,
  COUNT(*) FILTER (WHERE d7_eligible)                             AS d7_eligible,
  ROUND(100.0 * COUNT(*) FILTER (WHERE d7_eligible AND d7_retained)
        / NULLIF(COUNT(*) FILTER (WHERE d7_eligible), 0), 1)      AS d7_pct,
  COUNT(*) FILTER (WHERE d30_eligible)                            AS d30_eligible,
  ROUND(100.0 * COUNT(*) FILTER (WHERE d30_eligible AND d30_retained)
        / NULLIF(COUNT(*) FILTER (WHERE d30_eligible), 0), 1)     AS d30_pct
FROM flags
GROUP BY via
ORDER BY signups DESC;


-- ════════════════════════════════════════════════════════════
-- 5. Onboarding funnel reach by source (onboarding_events)
-- ════════════════════════════════════════════════════════════
--
-- From the S2 build on, first_home_view.metadata carries the install's
-- first-touch via / src (null before that build, or when nothing brought the
-- install in). Pairs with metrics-dashboard §1.
SELECT
  COALESCE(e.metadata->>'via', '(none)') AS via,
  COALESCE(e.metadata->>'src', '(none)') AS src,
  COUNT(DISTINCT e.user_id)              AS users_reaching_first_home_view
FROM onboarding_events e
JOIN profiles p ON p.id = e.user_id AND p.is_test_user IS NOT TRUE
WHERE e.event_name = 'first_home_view'
  AND e.created_at >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY 3 DESC;


-- ════════════════════════════════════════════════════════════
-- 6. Sharing and notifications (Growth S4, last 30 days)
-- ════════════════════════════════════════════════════════════
--
-- share_initiated: the sheet opened (metadata.surface = detail | room |
-- room_card; metadata.moment = arrival | leaving_soon when shared from
-- "Tell someone"). share_completed: the OS reported a share, with
-- metadata.to_surface (iOS activity type) and platform_reports_completion.
-- Android reports a dismissed sheet as shared, so completion is iOS only.
-- src = push when the share happened in a session a push tap opened.
-- notification_opened: a push tap; delivery_id is the notification_deliveries
-- row for a single-title push, null for a bundle; metadata.type = arrival |
-- leaving_soon | bundle. Pushes sent before the S4 function deploy carry no
-- delivery_id, so their opens never join.

-- 6a. Share completion rate, iOS only, by surface (NULL surface = all).
WITH test_installs AS (
  SELECT DISTINCT g.install_id
  FROM growth_events g
  JOIN profiles p ON p.id = g.user_id AND p.is_test_user IS TRUE
  WHERE g.install_id IS NOT NULL
)
SELECT
  g.metadata->>'surface'                                           AS surface,
  COUNT(*) FILTER (WHERE g.event_name = 'share_initiated')         AS initiated,
  COUNT(*) FILTER (WHERE g.event_name = 'share_completed')         AS completed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE g.event_name = 'share_completed')
        / NULLIF(COUNT(*) FILTER (WHERE g.event_name = 'share_initiated'), 0), 1) AS completion_pct
FROM growth_events g
WHERE g.event_name IN ('share_initiated', 'share_completed')
  AND g.platform = 'ios'
  AND g.occurred_at >= now() - interval '30 days'
  AND g.install_id NOT IN (SELECT install_id FROM test_installs)
GROUP BY ROLLUP (g.metadata->>'surface')
ORDER BY surface NULLS LAST;

-- 6b. Share rate by session origin: push-originated shares per notification
-- open; organic shares per active user (distinct users with any
-- user_interactions row in the window).
WITH test_installs AS (
  SELECT DISTINCT g.install_id
  FROM growth_events g
  JOIN profiles p ON p.id = g.user_id AND p.is_test_user IS TRUE
  WHERE g.install_id IS NOT NULL
),
events AS (
  SELECT g.event_name, g.src
  FROM growth_events g
  WHERE g.event_name IN ('share_initiated', 'notification_opened')
    AND g.occurred_at >= now() - interval '30 days'
    AND g.install_id NOT IN (SELECT install_id FROM test_installs)
),
active AS (
  SELECT COUNT(DISTINCT u.user_id) AS users
  FROM user_interactions u
  JOIN profiles p ON p.id = u.user_id AND p.is_test_user IS NOT TRUE
  WHERE u.created_at >= now() - interval '30 days'
),
counts AS (
  SELECT
    COUNT(*) FILTER (WHERE event_name = 'share_initiated' AND src = 'push')                      AS push_shares,
    COUNT(*) FILTER (WHERE event_name = 'share_initiated' AND COALESCE(src, 'organic') = 'organic') AS organic_shares,
    COUNT(*) FILTER (WHERE event_name = 'notification_opened')                                   AS push_opens
  FROM events
)
SELECT 'push' AS session_origin, c.push_shares AS shares, 'notification opens' AS denominator,
       c.push_opens AS denominator_count,
       ROUND(c.push_shares::numeric / NULLIF(c.push_opens, 0), 3) AS shares_per_denominator
FROM counts c
UNION ALL
SELECT 'organic', c.organic_shares, 'active users', a.users,
       ROUND(c.organic_shares::numeric / NULLIF(a.users, 0), 3)
FROM counts c, active a;

-- 6c. Notification click-through by push type. One push = the delivery rows
-- one send claimed (same user and Expo ticket). It is single-title when its
-- lead group holds one title (one arrival, or no arrivals and one
-- leaving-soon title), and that row's id is the payload's delivery_id;
-- anything else went out as a bundle. Single-title CTR joins opens on
-- delivery_id (pushes opened at least once). Bundle opens have no delivery id,
-- so they are counted, not joined (a tap on each of two devices counts twice).
WITH test_installs AS (
  SELECT DISTINCT g.install_id
  FROM growth_events g
  JOIN profiles p ON p.id = g.user_id AND p.is_test_user IS TRUE
  WHERE g.install_id IS NOT NULL
),
pushes AS (
  SELECT
    d.user_id,
    d.expo_ticket_id,
    COUNT(*) FILTER (WHERE d.notification_type = 'arrival')                  AS arrivals,
    COUNT(*) FILTER (WHERE d.notification_type = 'leaving_soon')             AS leaving,
    (array_agg(d.id) FILTER (WHERE d.notification_type = 'arrival'))[1]      AS arrival_id,
    (array_agg(d.id) FILTER (WHERE d.notification_type = 'leaving_soon'))[1] AS leaving_id
  FROM notification_deliveries d
  JOIN profiles p ON p.id = d.user_id AND p.is_test_user IS NOT TRUE
  WHERE d.sent_at >= now() - interval '30 days'
    AND d.expo_ticket_id IS NOT NULL
    AND d.delivery_status <> 'error'
  GROUP BY 1, 2
),
classified AS (
  SELECT
    CASE WHEN arrivals = 1 THEN 'arrival'
         WHEN arrivals = 0 AND leaving = 1 THEN 'leaving_soon'
         ELSE 'bundle' END                                     AS push_type,
    CASE WHEN arrivals = 1 THEN arrival_id
         WHEN arrivals = 0 AND leaving = 1 THEN leaving_id END AS delivery_id
  FROM pushes
),
opens AS (
  SELECT g.delivery_id, g.metadata->>'type' AS push_type
  FROM growth_events g
  WHERE g.event_name = 'notification_opened'
    AND g.occurred_at >= now() - interval '30 days'
    AND g.install_id NOT IN (SELECT install_id FROM test_installs)
),
per_type AS (
  SELECT
    t.push_type,
    (SELECT COUNT(*) FROM classified c WHERE c.push_type = t.push_type) AS pushes_sent,
    CASE WHEN t.push_type = 'bundle'
         THEN (SELECT COUNT(*) FROM opens o WHERE o.push_type = 'bundle')
         ELSE (SELECT COUNT(*) FROM classified c
               WHERE c.push_type = t.push_type
                 AND c.delivery_id IN (SELECT delivery_id FROM opens WHERE delivery_id IS NOT NULL))
    END                                                                 AS opened
  FROM (VALUES ('arrival'), ('leaving_soon'), ('bundle')) AS t(push_type)
)
SELECT
  push_type,
  pushes_sent,
  opened,
  ROUND(100.0 * opened / NULLIF(pushes_sent, 0), 1)                       AS ctr_pct,
  CASE WHEN push_type = 'bundle' THEN 'opens counted' ELSE 'joined on delivery_id' END AS method
FROM per_type
ORDER BY push_type;

-- 6d. "Tell someone" take-up: single-title push opens against shares made
-- from the moment (share_initiated with metadata.moment), by push type. A
-- moment share comes from the top-right button or the banner.
WITH test_installs AS (
  SELECT DISTINCT g.install_id
  FROM growth_events g
  JOIN profiles p ON p.id = g.user_id AND p.is_test_user IS TRUE
  WHERE g.install_id IS NOT NULL
),
events AS (
  SELECT g.event_name, g.platform, g.metadata->>'type' AS push_type, g.metadata->>'moment' AS moment
  FROM growth_events g
  WHERE g.event_name IN ('notification_opened', 'share_initiated', 'share_completed')
    AND g.occurred_at >= now() - interval '30 days'
    AND g.install_id NOT IN (SELECT install_id FROM test_installs)
)
SELECT
  t.moment,
  (SELECT COUNT(*) FROM events e WHERE e.event_name = 'notification_opened' AND e.push_type = t.moment) AS push_opens,
  (SELECT COUNT(*) FROM events e WHERE e.event_name = 'share_initiated' AND e.moment = t.moment)        AS moment_shares,
  (SELECT COUNT(*) FROM events e WHERE e.event_name = 'share_completed' AND e.moment = t.moment
                                   AND e.platform = 'ios')                                            AS moment_shares_completed_ios,
  ROUND((SELECT COUNT(*) FROM events e WHERE e.event_name = 'share_initiated' AND e.moment = t.moment)::numeric
        / NULLIF((SELECT COUNT(*) FROM events e WHERE e.event_name = 'notification_opened' AND e.push_type = t.moment), 0), 3)
                                                                                                      AS shares_per_open
FROM (VALUES ('arrival'), ('leaving_soon')) AS t(moment)
ORDER BY t.moment;
