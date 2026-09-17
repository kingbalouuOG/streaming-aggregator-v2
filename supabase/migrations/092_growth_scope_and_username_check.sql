-- =============================================================================
-- 092 — Growth code sweep (2026-09-17): scope the install-id join to
--       unattributed rows; explicit deletes for the cascade-only tables;
--       username_available excludes the caller's own name.
--
-- Why (sweep findings, docs/v2/phase-summaries/phase-growth-code-sweep-summary.md):
--
--   1. export_user_data() and delete_own_account() (090 §4/§5) swept every
--      growth_events row of any install the caller had used, INCLUDING rows
--      another signed-in account wrote on the same phone. An export therefore
--      disclosed the other account's user_id and activity, and a deletion
--      erased them. The install-id join now reaches only rows with no
--      user_id (the pre-sign-up trail the profiles cascade cannot see); rows
--      attributed to another account are never touched. IN-GR-009 wording
--      updated accordingly.
--   2. Six user-scoped tables relied on the profiles cascade alone
--      (app_feedback, availability_reports, card_impression_daily_totals,
--      notification_deliveries, notification_preferences, user_push_tokens).
--      042's belt-and-braces contract wants explicit DELETEs; added.
--   3. username_available(check_username) returned false for the caller's
--      own current name, so a "Choose your name" or Profile save whose
--      profiles write succeeded but whose auth.updateUser failed could never
--      be retried: the just-claimed name read as taken (sweep, finder B 2).
--      The check now ignores the caller's own profiles row. Anonymous
--      callers (sign-up) are unaffected: auth.uid() is null there.
--
-- Additive; no data change. export version stays 1.3: the shape is unchanged,
-- only the row set on shared installs. Reversibility: re-apply 090 §4/§5 and
-- 053 §2 (the previous bodies), which restores the wider install-id sweep.
-- Apply in Studio (never db push); regenerate database.types.ts is not
-- needed (no table change).
-- =============================================================================

-- =============================================================================
-- 1. delete_own_account()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_own_account called without auth.uid()';
  END IF;

  -- Growth G0 / migrations 090 + 092. Rows written before sign-up carry only
  -- the install id, so the profiles cascade cannot reach them: delete the
  -- UNATTRIBUTED rows of any install this account has used, then the
  -- account's own rows. Rows another signed-in account wrote on the same
  -- install (user_id set, not ours) are theirs and stay (IN-GR-009).
  DELETE FROM public.growth_events
   WHERE user_id IS NULL
     AND install_id IN (
       SELECT g.install_id FROM public.growth_events g
        WHERE g.user_id = v_user_id AND g.install_id IS NOT NULL
     );
  DELETE FROM public.growth_events       WHERE user_id = v_user_id;

  -- Public-schema tables that reference profiles. CASCADE handles these
  -- automatically when the profiles row is deleted below; the explicit
  -- DELETEs are belt-and-braces against a future cascade-rule regression.
  DELETE FROM public.card_impressions    WHERE user_id = v_user_id;
  DELETE FROM public.card_impression_daily_totals WHERE user_id = v_user_id;  -- 092
  DELETE FROM public.user_interactions   WHERE user_id = v_user_id;
  DELETE FROM public.taste_profiles      WHERE user_id = v_user_id;
  DELETE FROM public.user_services       WHERE user_id = v_user_id;
  DELETE FROM public.user_service_addons WHERE user_id = v_user_id;  -- IN-SC-004 / migration 086
  DELETE FROM public.user_genres         WHERE user_id = v_user_id;
  DELETE FROM public.watchlist           WHERE user_id = v_user_id;
  DELETE FROM public.onboarding_events   WHERE user_id = v_user_id;
  DELETE FROM public.availability_reports WHERE user_id = v_user_id;         -- 092
  DELETE FROM public.app_feedback        WHERE user_id = v_user_id;          -- 092
  DELETE FROM public.notification_deliveries WHERE user_id = v_user_id;      -- 092
  DELETE FROM public.notification_preferences WHERE user_id = v_user_id;     -- 092
  DELETE FROM public.user_push_tokens    WHERE user_id = v_user_id;          -- 092
  DELETE FROM public.shared_rooms        WHERE created_by = v_user_id;  -- Growth G0 / migration 088

  -- Public-schema tables that reference auth.users directly.
  DELETE FROM public.user_feature_flags WHERE user_id = v_user_id;
  DELETE FROM public.user_interest_centroids WHERE user_id = v_user_id;  -- ENG-1 / migration 044

  -- profiles row last in the public schema (its CASCADE will have
  -- already removed all the rows above; this is the defensive
  -- backstop).
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- Finally the auth.users row. Any cascade rules still attached
  -- to auth.users will fire here harmlessly — every child row has
  -- already been removed above.
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$function$;

-- =============================================================================
-- 2. export_user_data() — same rows section 1 deletes
-- =============================================================================

CREATE OR REPLACE FUNCTION public.export_user_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id  uuid := auth.uid();
  v_payload  jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'export_user_data called without auth.uid()';
  END IF;

  SELECT jsonb_build_object(
    '_export_metadata', jsonb_build_object(
      'version',      '1.3',
      'generated_at', now(),
      'user_id',      v_user_id
    ),
    'profiles', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.profiles t WHERE t.id = v_user_id), '[]'::jsonb),
    'taste_profiles', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.taste_profiles t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_services', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_services t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_service_addons', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_service_addons t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_genres', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_genres t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'watchlist', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.watchlist t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_interactions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_interactions t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'card_impressions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.card_impressions t WHERE t.user_id = v_user_id AND t.shown_at > now() - interval '90 days'), '[]'::jsonb),
    'onboarding_events', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.onboarding_events t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'availability_reports', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.availability_reports t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_interest_centroids', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_interest_centroids t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_feature_flags', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_feature_flags t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'app_feedback', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.app_feedback t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_push_tokens', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_push_tokens t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'notification_preferences', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.notification_preferences t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'notification_deliveries', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.notification_deliveries t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'card_impression_daily_totals', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.card_impression_daily_totals t WHERE t.user_id = v_user_id), '[]'::jsonb),
    -- Growth G0 / migration 088 --
    'shared_rooms', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.shared_rooms t WHERE t.created_by = v_user_id), '[]'::jsonb),
    -- Growth G0 / migrations 090 + 092: the caller's rows plus the
    -- UNATTRIBUTED rows of installs the caller used; never another account's --
    'growth_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.occurred_at)
        FROM public.growth_events t
       WHERE t.user_id = v_user_id
          OR (t.user_id IS NULL AND t.install_id IN (
               SELECT g.install_id FROM public.growth_events g
                WHERE g.user_id = v_user_id AND g.install_id IS NOT NULL
             ))
    ), '[]'::jsonb)
  )
  INTO v_payload;

  RETURN v_payload;
END;
$function$;

-- =============================================================================
-- 3. username_available(check_username) — ignore the caller's own row.
--    Body is 053's (per-IP fixed-window rate limit, IN-PX-29) with one
--    predicate added to the final EXISTS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.username_available(check_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_headers  json;
  v_ip       text;
  v_xff      text[];
  v_key      text;
  v_window   timestamptz := date_trunc('minute', now());
  v_count    integer;
  v_limit    constant integer := 30;
BEGIN
  -- Client IP: cf-connecting-ip first (set by Cloudflare, cannot be spoofed
  -- from outside), then the LAST x-forwarded-for hop (the first is client-
  -- supplied, so trusting it would let an attacker rotate rate-limit
  -- buckets), then x-real-ip. Any failure (headers GUC unset, non-JSON,
  -- missing key) leaves v_ip NULL and we fall through without
  -- rate-limiting rather than blocking.
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    v_ip := v_headers ->> 'cf-connecting-ip';
    IF v_ip IS NULL OR length(btrim(v_ip)) = 0 THEN
      v_xff := string_to_array(coalesce(v_headers ->> 'x-forwarded-for', ''), ',');
      v_ip := btrim(v_xff[array_upper(v_xff, 1)]);
    END IF;
    IF v_ip IS NULL OR length(btrim(v_ip)) = 0 THEN
      v_ip := v_headers ->> 'x-real-ip';
    END IF;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;

  IF v_ip IS NOT NULL AND length(btrim(v_ip)) > 0 THEN
    v_key := md5(btrim(v_ip));

    -- Opportunistic cleanup (~1% of calls) keeps the table tiny without a
    -- dedicated cron. Windows older than an hour are long dead.
    IF random() < 0.01 THEN
      DELETE FROM public.username_check_rate_limit
      WHERE window_start < now() - interval '1 hour';
    END IF;

    INSERT INTO public.username_check_rate_limit (client_key, window_start, request_count)
    VALUES (v_key, v_window, 1)
    ON CONFLICT (client_key, window_start)
    DO UPDATE SET request_count = public.username_check_rate_limit.request_count + 1
    RETURNING request_count INTO v_count;

    IF v_count > v_limit THEN
      RAISE EXCEPTION 'rate limit exceeded for username availability checks'
        USING errcode = '54000';  -- program_limit_exceeded
    END IF;
  END IF;

  -- 092: the caller's own current name is always available to the caller,
  -- so a half-completed rename can be retried (auth.uid() is null for the
  -- anonymous sign-up check, which keeps its previous behaviour).
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE username = check_username
       AND id IS DISTINCT FROM auth.uid()
  );
END;
$function$;

COMMENT ON FUNCTION public.username_available(text) IS
  'Returns true when the given username is available to the caller: taken '
  'by nobody, or taken by the caller themselves (092). SECURITY DEFINER so '
  'anon callers can use it without direct SELECT on profiles. IN-PX-29: '
  'per-IP fixed-window rate limit (30/min); fails open when no client IP '
  'is attributable.';

GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;
