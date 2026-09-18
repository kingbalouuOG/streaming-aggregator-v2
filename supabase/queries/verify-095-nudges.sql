-- Verify migration 095 (household nudges: delivery shape, dedup keys, cron).
--
-- Run in the Studio SQL editor AFTER applying 095. Everything happens in one
-- transaction that ends in ROLLBACK, so no fixture row survives. Any failed
-- ASSERT aborts with its message; success prints one NOTICE per step and
-- 'verify-095: all checks passed' last.
--
-- Same rig as verify-093-households.sql / verify-094: fixture users go
-- straight into auth.users with the reserved .invalid TLD. Deliveries are
-- written as the admin role, as the service-role Edge Functions do.
--
-- The ON CONFLICT (cols) DO NOTHING statements below are exactly what
-- PostgREST sends for upsert(onConflict: cols, ignoreDuplicates: true): they
-- prove both unique indexes can be inferred by the two functions' claims.

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h4-fixture-' || u.tag || '@example.invalid',
       jsonb_build_object('username', 'h4fix' || u.tag), '{"provider":"email"}'::jsonb, now(), now()
  FROM (VALUES
    ('95000000-0000-4000-8000-00000000000a', 'a'),
    ('95000000-0000-4000-8000-00000000000b', 'b')
  ) AS u(id, tag);

INSERT INTO public.profiles (id, username)
SELECT u.id, 'h4fix' || substr(u.email, 12, 1)
  FROM auth.users u
 WHERE u.email LIKE 'h4-fixture-_@example.invalid'
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION pg_temp.raises(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END $f$;

DO $$
DECLARE
  a      constant uuid := '95000000-0000-4000-8000-00000000000a';
  b      constant uuid := '95000000-0000-4000-8000-00000000000b';
  v_hid  uuid;
  v_lid  uuid;
  v_win  constant timestamptz := date_trunc('hour', now());
  v_err  text;
  v_n    int;
BEGIN
  INSERT INTO public.households (name, owner_id) VALUES ('H4 fixture', a) RETURNING id INTO v_hid;
  INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (v_hid, a, 'owner'), (v_hid, b, 'member');
  INSERT INTO public.watchlists (household_id, created_by) VALUES (v_hid, a) RETURNING id INTO v_lid;

  -- 1. Preferences take the third type ------------------------------------------
  INSERT INTO public.notification_preferences (user_id, notification_type, enabled)
    VALUES (b, 'household_nudge', false);
  v_err := pg_temp.raises(format(
    'INSERT INTO public.notification_preferences (user_id, notification_type) VALUES (%L, %L)', b, 'digest'));
  ASSERT v_err LIKE '23514%', format('unknown preference type accepted: %s', coalesce(v_err, 'succeeded'));
  RAISE NOTICE '1 ok: notification_preferences accepts household_nudge, refuses others';

  -- 2. Nudge dedup: one per person, list and hour window -------------------------
  INSERT INTO public.notification_deliveries (user_id, notification_type, list_id, nudge_window, push_id)
    VALUES (b, 'household_nudge', v_lid, v_win, gen_random_uuid())
    ON CONFLICT (user_id, notification_type, list_id, nudge_window) DO NOTHING;
  INSERT INTO public.notification_deliveries (user_id, notification_type, list_id, nudge_window, push_id)
    VALUES (b, 'household_nudge', v_lid, v_win, gen_random_uuid())
    ON CONFLICT (user_id, notification_type, list_id, nudge_window) DO NOTHING;
  SELECT count(*) INTO v_n FROM public.notification_deliveries WHERE user_id = b AND notification_type = 'household_nudge';
  ASSERT v_n = 1, format('second nudge in the same window was claimed (%s rows)', v_n);
  v_err := pg_temp.raises(format(
    'INSERT INTO public.notification_deliveries (user_id, notification_type, list_id, nudge_window) VALUES (%L, %L, %L, %L)',
    b, 'household_nudge', v_lid, v_win));
  ASSERT v_err LIKE '23505%', format('plain insert of a duplicate nudge: %s', coalesce(v_err, 'succeeded'));
  INSERT INTO public.notification_deliveries (user_id, notification_type, list_id, nudge_window)
    VALUES (b, 'household_nudge', v_lid, v_win + interval '1 hour');
  INSERT INTO public.notification_deliveries (user_id, notification_type, list_id, nudge_window)
    VALUES (a, 'household_nudge', v_lid, v_win);
  RAISE NOTICE '2 ok: nudge key refuses a second claim in the window; next window and another member pass';

  -- 3. Title dedup unchanged, and it ignores nudge rows --------------------------
  INSERT INTO public.notification_deliveries (user_id, notification_type, tmdb_id, media_type, push_id)
    VALUES (b, 'arrival', 603, 'movie', gen_random_uuid())
    ON CONFLICT (user_id, notification_type, tmdb_id, media_type) DO NOTHING;
  INSERT INTO public.notification_deliveries (user_id, notification_type, tmdb_id, media_type)
    VALUES (b, 'arrival', 603, 'movie')
    ON CONFLICT (user_id, notification_type, tmdb_id, media_type) DO NOTHING;
  SELECT count(*) INTO v_n FROM public.notification_deliveries WHERE user_id = b AND notification_type = 'arrival';
  ASSERT v_n = 1, format('second arrival for the same title was claimed (%s rows)', v_n);
  INSERT INTO public.notification_deliveries (user_id, notification_type, tmdb_id, media_type)
    VALUES (b, 'leaving_soon', 603, 'movie');
  RAISE NOTICE '3 ok: title key still one per person, type and title; nudges never collide with it';

  -- 4. Shape: a nudge needs list_id and nudge_window; a title alert needs its title
  v_err := pg_temp.raises(format(
    'INSERT INTO public.notification_deliveries (user_id, notification_type, nudge_window) VALUES (%L, %L, now())',
    b, 'household_nudge'));
  ASSERT v_err LIKE '23514%household_nudge needs list_id%', format('nudge without list_id: %s', coalesce(v_err, 'succeeded'));
  v_err := pg_temp.raises(format(
    'INSERT INTO public.notification_deliveries (user_id, notification_type, list_id) VALUES (%L, %L, %L)',
    b, 'household_nudge', v_lid));
  ASSERT v_err LIKE '23514%shape_check%', format('nudge without nudge_window: %s', coalesce(v_err, 'succeeded'));
  v_err := pg_temp.raises(format(
    'INSERT INTO public.notification_deliveries (user_id, notification_type, media_type) VALUES (%L, %L, %L)',
    b, 'arrival', 'movie'));
  ASSERT v_err LIKE '23514%shape_check%', format('arrival without tmdb_id: %s', coalesce(v_err, 'succeeded'));
  v_err := pg_temp.raises(format(
    'INSERT INTO public.notification_deliveries (user_id, notification_type, tmdb_id, media_type, list_id) VALUES (%L, %L, 1, %L, %L)',
    b, 'arrival', 'movie', v_lid));
  ASSERT v_err LIKE '23514%shape_check%', format('arrival carrying a list_id: %s', coalesce(v_err, 'succeeded'));
  v_err := pg_temp.raises(format(
    'INSERT INTO public.notification_deliveries (user_id, notification_type, tmdb_id, media_type, list_id, nudge_window) VALUES (%L, %L, 1, %L, %L, now())',
    b, 'household_nudge', 'movie', v_lid));
  ASSERT v_err LIKE '23514%shape_check%', format('nudge carrying a title: %s', coalesce(v_err, 'succeeded'));
  RAISE NOTICE '4 ok: shape CHECK and insert trigger refuse every mixed or missing shape';

  -- 5. Deleting the household keeps the recipient's nudge rows, list_id nulled --
  DELETE FROM public.households WHERE id = v_hid;
  SELECT count(*) INTO v_n FROM public.notification_deliveries
   WHERE user_id IN (a, b) AND notification_type = 'household_nudge' AND list_id IS NULL AND nudge_window IS NOT NULL;
  ASSERT v_n = 3, format('expected 3 nudge rows with list_id nulled, got %s', v_n);
  RAISE NOTICE '5 ok: ON DELETE SET NULL passes the shape CHECK; history survives the list';

  -- 6. Cron job registered ---------------------------------------------------------
  SELECT count(*) INTO v_n FROM cron.job
   WHERE jobname = 'send-nudges-15m' AND schedule = '*/15 * * * *' AND active
     AND command LIKE '%/functions/v1/send-nudges%' AND command LIKE '%service_role_key%';
  ASSERT v_n = 1, 'cron job send-nudges-15m missing, inactive or not calling send-nudges';
  RAISE NOTICE '6 ok: send-nudges-15m scheduled every 15 minutes with the Vault key';

  -- 7. Indexes and trigger in place -------------------------------------------------
  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'notification_deliveries'
     AND indexname IN ('uq_notification_deliveries_dedup', 'uq_notification_deliveries_nudge',
                       'idx_notification_deliveries_user_time', 'idx_notification_deliveries_list');
  ASSERT v_n = 4, format('expected 4 indexes, found %s', v_n);
  RAISE NOTICE '7 ok: both unique keys, the cap index and the list index exist';

  RAISE NOTICE 'verify-095: all checks passed';
END $$;

ROLLBACK;
