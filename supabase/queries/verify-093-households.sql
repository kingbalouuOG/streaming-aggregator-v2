-- Verify migration 093 (households, membership RLS, invite/join RPCs).
--
-- Run in the Studio SQL editor AFTER applying 093. Everything happens in one
-- transaction that ends in ROLLBACK, so no fixture row survives. Any failed
-- ASSERT aborts with its message; success prints one NOTICE per step and
-- 'verify-093: all checks passed' last.
--
-- Seven fixture users (A–G) go straight into auth.users with the reserved
-- .invalid TLD; handle_new_user makes their profiles rows (the INSERT below
-- is a no-op backstop). Acting as a user = SET ROLE authenticated plus
-- request.jwt.claims, exactly what PostgREST does; pg_temp.act_as_admin()
-- returns to the session role (postgres, which owns the tables and so
-- bypasses RLS) for fixture tweaks and ground-truth reads.
--
-- Fixture ids are chosen so user-id order DISAGREES with join order (B has
-- the highest id but joins first), so the ownership hand-over proves it
-- follows joined_at and not the tie-break.

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h1-fixture-' || u.tag || '@example.invalid',
       jsonb_build_object('username', 'h1fix' || u.tag), '{"provider":"email"}'::jsonb, now(), now()
  FROM (VALUES
    ('93000000-0000-4000-8000-00000000000a', 'a'),
    ('93000000-0000-4000-8000-0000000000ff', 'b'),
    ('93000000-0000-4000-8000-00000000000b', 'c'),
    ('93000000-0000-4000-8000-00000000000c', 'd'),
    ('93000000-0000-4000-8000-00000000000d', 'e'),
    ('93000000-0000-4000-8000-00000000000e', 'f'),
    ('93000000-0000-4000-8000-000000000010', 'g')
  ) AS u(id, tag);

INSERT INTO public.profiles (id, username)
SELECT u.id, 'h1fix' || substr(u.email, 12, 1)
  FROM auth.users u
 WHERE u.email LIKE 'h1-fixture-_@example.invalid'
ON CONFLICT (id) DO NOTHING;

-- Helpers (temporary; gone at ROLLBACK) ---------------------------------------

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
END $f$;

CREATE FUNCTION pg_temp.act_as_anon() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
END $f$;

CREATE FUNCTION pg_temp.act_as_admin() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $f$;

-- Runs p_sql as the current role; NULL on success, else 'SQLSTATE message'.
CREATE FUNCTION pg_temp.raises(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END $f$;

-- Rows the current role can read from a table; 0 when it may not read at all.
CREATE FUNCTION pg_temp.visible_rows(p_table text) RETURNS integer LANGUAGE plpgsql AS $f$
DECLARE n integer;
BEGIN
  EXECUTE format('SELECT count(*) FROM %s', p_table) INTO n;
  RETURN n;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 0;
END $f$;

DO $$
DECLARE
  a  constant uuid := '93000000-0000-4000-8000-00000000000a';
  b  constant uuid := '93000000-0000-4000-8000-0000000000ff';
  c  constant uuid := '93000000-0000-4000-8000-00000000000b';
  d  constant uuid := '93000000-0000-4000-8000-00000000000c';
  e  constant uuid := '93000000-0000-4000-8000-00000000000d';
  f  constant uuid := '93000000-0000-4000-8000-00000000000e';
  g  constant uuid := '93000000-0000-4000-8000-000000000010';
  r        record;
  v_hid    uuid;
  v_wid    uuid;
  v_hid_b  uuid;
  v_tok    uuid;
  v_old    uuid;
  v_item_a uuid;
  v_item_b uuid;
  v_item_c uuid;
  v_wid_2  uuid;
  v_err    text;
  v_n      integer;
  v_json   jsonb;
  v_t      text;
BEGIN
  -- 1. create_household as A ---------------------------------------------------
  PERFORM pg_temp.act_as(a);
  SELECT * INTO r FROM public.create_household('  Sofa  ');
  v_hid := r.household_id;
  v_wid := r.watchlist_id;
  ASSERT v_hid IS NOT NULL AND v_wid IS NOT NULL, 'create_household returned nulls';
  ASSERT (SELECT h.name FROM public.households h WHERE h.id = v_hid) = 'Sofa', 'name not trimmed or not visible to owner';
  ASSERT (SELECT w.name FROM public.watchlists w WHERE w.id = v_wid) = 'Shared', 'list not named Shared';
  SELECT count(*) INTO v_n FROM public.household_members_view(v_hid);
  ASSERT v_n = 1, format('members_view as A: %s rows, want 1', v_n);
  SELECT * INTO r FROM public.household_members_view(v_hid);
  ASSERT r.user_id = a AND r.role = 'owner' AND r.username = 'h1fixa', format('members_view row %s', r);
  v_err := pg_temp.raises($q$SELECT public.create_household('   ')$q$);
  ASSERT v_err = 'P0001 invalid_name', format('blank name: %s', v_err);
  RAISE NOTICE '1 ok: A created household %, list %, one owner row', v_hid, v_wid;

  -- 2. B is not a member: invisible under RLS, RPCs refuse ------------------------
  PERFORM pg_temp.act_as(b);
  ASSERT (SELECT count(*) FROM public.households WHERE id = v_hid) = 0, 'B sees the household';
  ASSERT (SELECT count(*) FROM public.household_members WHERE household_id = v_hid) = 0, 'B sees members';
  ASSERT (SELECT count(*) FROM public.watchlists WHERE household_id = v_hid) = 0, 'B sees the list';
  v_err := pg_temp.raises(format('SELECT * FROM public.household_members_view(%L)', v_hid));
  ASSERT v_err = 'P0001 not_member', format('members_view as B: %s', v_err);
  v_err := pg_temp.raises(format('SELECT * FROM public.create_invite(%L)', v_hid));
  ASSERT v_err = 'P0001 not_owner', format('create_invite as B: %s', v_err);
  v_err := pg_temp.raises(format('SELECT public.leave_household(%L)', v_hid));
  ASSERT v_err = 'P0001 not_member', format('leave as non-member: %s', v_err);
  RAISE NOTICE '2 ok: non-member B sees nothing; members_view not_member, create_invite not_owner';

  -- 3. create_invite as A; a second invite revokes the first ----------------------
  PERFORM pg_temp.act_as(a);
  SELECT * INTO r FROM public.create_invite(v_hid);
  v_old := r.token;
  ASSERT r.expires_at BETWEEN now() + interval '6 days 23 hours' AND now() + interval '7 days 1 hour',
    format('expiry %s', r.expires_at);
  SELECT * INTO r FROM public.create_invite(v_hid);
  v_tok := r.token;
  ASSERT v_tok <> v_old, 'second invite reused the token';
  v_err := pg_temp.raises('SELECT * FROM public.household_invites');
  ASSERT v_err LIKE '42501%', format('owner read household_invites directly: %s', v_err);
  PERFORM pg_temp.act_as_admin();
  ASSERT (SELECT revoked_at IS NOT NULL FROM public.household_invites WHERE token = v_old), 'old invite not revoked';
  ASSERT (SELECT revoked_at IS NULL AND max_uses = 6 AND uses = 0 FROM public.household_invites WHERE token = v_tok), 'new invite defaults wrong';
  RAISE NOTICE '3 ok: invite minted (7 days, 6 uses), previous one revoked, table unreadable to the owner';

  -- 4. join_household as B, then again (idempotent) ------------------------------
  PERFORM pg_temp.act_as(b);
  SELECT * INTO r FROM public.join_household(v_tok);
  ASSERT r.household_id = v_hid AND r.watchlist_id = v_wid AND r.already_member = false, format('first join %s', r);
  SELECT * INTO r FROM public.join_household(v_tok);
  ASSERT r.household_id = v_hid AND r.watchlist_id = v_wid AND r.already_member = true, format('second join %s', r);
  ASSERT (SELECT count(*) FROM public.households WHERE id = v_hid) = 1, 'member B cannot see the household';
  SELECT count(*) INTO v_n FROM public.household_members_view(v_hid);
  ASSERT v_n = 2, format('members_view as B: %s rows', v_n);
  PERFORM pg_temp.act_as_admin();
  ASSERT (SELECT uses FROM public.household_invites WHERE token = v_tok) = 1, 'repeat join incremented uses';
  -- Deterministic join order: B first, whatever the clock says.
  UPDATE public.household_members SET joined_at = now() - interval '10 minutes' WHERE household_id = v_hid AND user_id = a;
  UPDATE public.household_members SET joined_at = now() - interval '9 minutes'  WHERE household_id = v_hid AND user_id = b;
  RAISE NOTICE '4 ok: B joined (already_member false), rejoin true with uses unchanged';

  -- 5. Invite failure codes, as C ----------------------------------------------
  PERFORM pg_temp.act_as(c);
  v_err := pg_temp.raises(format('SELECT * FROM public.join_household(%L)', v_old));
  ASSERT v_err = 'P0001 invite_invalid', format('revoked token: %s', v_err);
  v_err := pg_temp.raises(format('SELECT * FROM public.join_household(%L)', gen_random_uuid()));
  ASSERT v_err = 'P0001 invite_invalid', format('unknown token: %s', v_err);
  PERFORM pg_temp.act_as_admin();
  UPDATE public.household_invites SET expires_at = now() - interval '1 second' WHERE token = v_tok;
  PERFORM pg_temp.act_as(c);
  v_err := pg_temp.raises(format('SELECT * FROM public.join_household(%L)', v_tok));
  ASSERT v_err = 'P0001 invite_expired', format('expired token: %s', v_err);
  PERFORM pg_temp.act_as_admin();
  UPDATE public.household_invites SET expires_at = now() + interval '7 days', max_uses = uses WHERE token = v_tok;
  PERFORM pg_temp.act_as(c);
  v_err := pg_temp.raises(format('SELECT * FROM public.join_household(%L)', v_tok));
  ASSERT v_err = 'P0001 invite_exhausted', format('exhausted token: %s', v_err);
  PERFORM pg_temp.act_as_admin();
  UPDATE public.household_invites SET max_uses = 6 WHERE token = v_tok;
  RAISE NOTICE '5 ok: invite_invalid (revoked, unknown), invite_expired, invite_exhausted';

  -- 6. Member cap: C–F fill the household to 6, G is refused ----------------------
  PERFORM pg_temp.act_as(c); PERFORM public.join_household(v_tok);
  PERFORM pg_temp.act_as(d); PERFORM public.join_household(v_tok);
  PERFORM pg_temp.act_as(e); PERFORM public.join_household(v_tok);
  PERFORM pg_temp.act_as(f); PERFORM public.join_household(v_tok);
  PERFORM pg_temp.act_as_admin();
  ASSERT (SELECT count(*) FROM public.household_members WHERE household_id = v_hid) = 6, 'not 6 members';
  ASSERT (SELECT uses FROM public.household_invites WHERE token = v_tok) = 5, 'uses not 5';
  UPDATE public.household_members SET joined_at = now() - interval '8 minutes' WHERE household_id = v_hid AND user_id = c;
  UPDATE public.household_members SET joined_at = now() - interval '7 minutes' WHERE household_id = v_hid AND user_id = d;
  PERFORM pg_temp.act_as(g);
  v_err := pg_temp.raises(format('SELECT * FROM public.join_household(%L)', v_tok));
  ASSERT v_err = 'P0001 household_full', format('seventh member: %s', v_err);
  RAISE NOTICE '6 ok: six members (uses 5 of 6), seventh refused household_full';

  -- 7. Items: spoofed added_by refused; non-member refused ------------------------
  PERFORM pg_temp.act_as(b);
  v_err := pg_temp.raises(format(
    $q$INSERT INTO public.watchlist_items (watchlist_id, tmdb_id, media_type, title, added_by) VALUES (%L, 603, 'movie', 'The Matrix', %L)$q$,
    v_wid, a));
  ASSERT v_err LIKE '42501%', format('B spoofing added_by = A: %s', v_err);
  INSERT INTO public.watchlist_items (watchlist_id, tmdb_id, media_type, title, added_by)
  VALUES (v_wid, 603, 'movie', 'The Matrix', b) RETURNING id INTO v_item_b;
  PERFORM pg_temp.act_as(a);
  INSERT INTO public.watchlist_items (watchlist_id, tmdb_id, media_type, title, added_by)
  VALUES (v_wid, 1399, 'tv', 'Game of Thrones', a) RETURNING id INTO v_item_a;
  PERFORM pg_temp.act_as(g);
  ASSERT (SELECT count(*) FROM public.watchlist_items WHERE watchlist_id = v_wid) = 0, 'non-member G sees items';
  v_err := pg_temp.raises(format(
    $q$INSERT INTO public.watchlist_items (watchlist_id, tmdb_id, media_type, title, added_by) VALUES (%L, 550, 'movie', 'Fight Club', %L)$q$,
    v_wid, g));
  ASSERT v_err LIKE '42501%', format('non-member insert: %s', v_err);
  PERFORM pg_temp.act_as(c);
  DELETE FROM public.watchlist_items WHERE id = v_item_b;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 0, 'member C deleted B''s item';
  v_err := pg_temp.raises(format($q$UPDATE public.watchlist_items SET title = 'x' WHERE id = %L$q$, v_item_b));
  ASSERT v_err LIKE '42501%', format('item UPDATE allowed: %s', v_err);
  INSERT INTO public.watchlist_items (watchlist_id, tmdb_id, media_type, title, added_by)
  VALUES (v_wid, 27205, 'movie', 'Inception', c) RETURNING id INTO v_item_c;
  PERFORM pg_temp.act_as(a);
  DELETE FROM public.watchlist_items WHERE id = v_item_c;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 1, 'owner A could not delete member C''s item';
  RAISE NOTICE '7 ok: added_by spoof rejected by WITH CHECK; non-member cannot read or insert; members cannot delete others'' items, the owner can; no UPDATE';

  -- 8. Reactions: B's upsert visible to A; no reacting as someone else ------------
  PERFORM pg_temp.act_as(a);
  INSERT INTO public.watchlist_reactions (item_id, user_id, reaction) VALUES (v_item_a, a, 'up');
  PERFORM pg_temp.act_as(b);
  INSERT INTO public.watchlist_reactions (item_id, user_id, reaction) VALUES (v_item_a, b, 'up')
    ON CONFLICT (item_id, user_id) DO UPDATE SET reaction = excluded.reaction;
  INSERT INTO public.watchlist_reactions (item_id, user_id, reaction) VALUES (v_item_a, b, 'tonight')
    ON CONFLICT (item_id, user_id) DO UPDATE SET reaction = excluded.reaction;
  v_err := pg_temp.raises(format(
    $q$INSERT INTO public.watchlist_reactions (item_id, user_id, reaction) VALUES (%L, %L, 'down')$q$, v_item_b, a));
  ASSERT v_err LIKE '42501%', format('B reacting as A: %s', v_err);
  PERFORM pg_temp.act_as(a);
  ASSERT (SELECT reaction FROM public.watchlist_reactions WHERE item_id = v_item_a AND user_id = b) = 'tonight',
    'A cannot see B''s reaction';
  UPDATE public.watchlist_reactions SET reaction = 'down' WHERE item_id = v_item_a AND user_id = b;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 0, 'A changed B''s reaction';
  PERFORM pg_temp.act_as(g);
  ASSERT (SELECT count(*) FROM public.watchlist_reactions WHERE item_id = v_item_a) = 0, 'non-member sees reactions';
  RAISE NOTICE '8 ok: B''s upserted reaction (tonight) visible to A; nobody writes another member''s reaction';

  -- 9. Rename: owner yes, member no ------------------------------------------------
  PERFORM pg_temp.act_as(b);
  UPDATE public.households SET name = 'Hijack' WHERE id = v_hid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 0, 'member renamed the household';
  v_err := pg_temp.raises(format('UPDATE public.households SET owner_id = %L WHERE id = %L', b, v_hid));
  ASSERT v_err LIKE '42501%', format('owner_id writable: %s', v_err);
  PERFORM pg_temp.act_as(a);
  UPDATE public.households SET name = 'Sofa 2' WHERE id = v_hid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 1, 'owner could not rename';
  v_err := pg_temp.raises(format('DELETE FROM public.households WHERE id = %L', v_hid));
  ASSERT v_err LIKE '42501%', format('direct household delete allowed: %s', v_err);
  RAISE NOTICE '9 ok: owner renames, member cannot; owner_id and DELETE not granted';

  -- 10. Limits: 3 owned households, 10 invites per 24h -----------------------------
  SELECT watchlist_id INTO v_wid_2 FROM public.create_household('Two');
  PERFORM public.create_household('Three');
  PERFORM pg_temp.act_as(b);
  v_err := pg_temp.raises(format(
    $q$INSERT INTO public.watchlist_items (watchlist_id, tmdb_id, media_type, title, added_by) VALUES (%L, 603, 'movie', 'The Matrix', %L)$q$,
    v_wid_2, b));
  ASSERT v_err LIKE '42501%', format('B wrote into A''s other household: %s', v_err);
  ASSERT (SELECT count(*) FROM public.watchlists WHERE id = v_wid_2) = 0, 'B sees A''s other list';
  PERFORM pg_temp.act_as(a);
  v_err := pg_temp.raises($q$SELECT public.create_household('Four')$q$);
  ASSERT v_err = 'P0001 household_limit', format('fourth household: %s', v_err);
  PERFORM pg_temp.act_as_admin();
  INSERT INTO public.household_invites (household_id, created_by, revoked_at)
  SELECT v_hid, a, now() FROM generate_series(1, 8);   -- A already minted 2 today
  PERFORM pg_temp.act_as(a);
  v_err := pg_temp.raises(format('SELECT * FROM public.create_invite(%L)', v_hid));
  ASSERT v_err = 'P0001 rate_limited', format('eleventh invite: %s', v_err);
  RAISE NOTICE '10 ok: no cross-household read or write; household_limit at 4, rate_limited at 11 invites in 24h';

  -- 11. leave_household as A (owner): ownership to B, the earliest joiner ----------
  PERFORM pg_temp.act_as(a);
  PERFORM public.leave_household(v_hid);
  v_err := pg_temp.raises(format('SELECT public.leave_household(%L)', v_hid));
  ASSERT v_err = 'P0001 not_member', format('second leave: %s', v_err);
  ASSERT (SELECT count(*) FROM public.households WHERE id = v_hid) = 0, 'A still sees the household';
  PERFORM pg_temp.act_as_admin();
  ASSERT (SELECT owner_id FROM public.households WHERE id = v_hid) = b, 'ownership did not pass to B';
  ASSERT (SELECT role FROM public.household_members WHERE household_id = v_hid AND user_id = b) = 'owner', 'B role not owner';
  ASSERT NOT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = v_hid AND user_id = a), 'A still a member';
  ASSERT (SELECT added_by IS NULL FROM public.watchlist_items WHERE id = v_item_a), 'A''s item kept added_by';
  ASSERT NOT EXISTS (SELECT 1 FROM public.watchlist_reactions WHERE user_id = a), 'A''s reaction survived';
  ASSERT EXISTS (SELECT 1 FROM public.watchlist_reactions WHERE item_id = v_item_a AND user_id = b), 'B''s reaction lost';
  ASSERT NOT EXISTS (SELECT 1 FROM public.household_invites WHERE household_id = v_hid AND revoked_at IS NULL), 'invites not revoked on hand-over';
  ASSERT (SELECT count(*) FROM public.households WHERE owner_id = a) = 2, 'A''s other households touched';
  RAISE NOTICE '11 ok: A left; B owns; A''s item kept with added_by null, A''s reaction gone, B''s kept, invites revoked';

  -- 12. delete_own_account as B: sole-owner household deleted, shared one passes to C
  PERFORM pg_temp.act_as(b);
  SELECT household_id INTO v_hid_b FROM public.create_household('Just B');
  PERFORM public.delete_own_account();
  PERFORM pg_temp.act_as_admin();
  ASSERT NOT EXISTS (SELECT 1 FROM public.households WHERE id = v_hid_b), 'B''s sole-owner household survived';
  ASSERT NOT EXISTS (SELECT 1 FROM public.watchlists WHERE household_id = v_hid_b), 'its list survived';
  ASSERT (SELECT owner_id FROM public.households WHERE id = v_hid) = c, 'shared household did not pass to C';
  ASSERT (SELECT count(*) FROM public.household_members WHERE household_id = v_hid) = 4, 'wrong member count after B';
  ASSERT (SELECT added_by IS NULL FROM public.watchlist_items WHERE id = v_item_b), 'B''s item kept added_by';
  ASSERT NOT EXISTS (SELECT 1 FROM public.watchlist_reactions WHERE user_id = b), 'B''s reaction survived';
  ASSERT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = b), 'B''s auth row survived';
  RAISE NOTICE '12 ok: delete_own_account(B) deleted B''s sole household, passed the shared one to C, kept B''s item';

  -- 13. export_user_data as C ----------------------------------------------------
  PERFORM pg_temp.act_as(c);
  INSERT INTO public.watchlist_reactions (item_id, user_id, reaction) VALUES (v_item_a, c, 'down');
  v_json := public.export_user_data();
  ASSERT v_json -> '_export_metadata' ->> 'version' = '1.4', 'export version';
  ASSERT jsonb_array_length(v_json -> 'households') = 1
     AND v_json -> 'households' -> 0 ->> 'role' = 'owner'
     AND v_json -> 'households' -> 0 ->> 'name' = 'Sofa 2', format('households %s', v_json -> 'households');
  ASSERT jsonb_array_length(v_json -> 'watchlist_items') = 0, 'C exported items C did not add';
  ASSERT jsonb_array_length(v_json -> 'watchlist_reactions') = 1
     AND v_json -> 'watchlist_reactions' -> 0 ->> 'reaction' = 'down', 'reactions export';
  ASSERT v_json ? 'growth_events', 'growth_events key lost';
  RAISE NOTICE '13 ok: export 1.4 carries households, own items, own reactions';

  -- 14. anon: no rows, no RPCs ---------------------------------------------------
  PERFORM pg_temp.act_as_anon();
  FOREACH v_t IN ARRAY ARRAY['public.households', 'public.household_members', 'public.watchlists',
                            'public.watchlist_items', 'public.watchlist_reactions', 'public.household_invites'] LOOP
    ASSERT pg_temp.visible_rows(v_t) = 0, format('anon reads %s', v_t);
  END LOOP;
  FOREACH v_t IN ARRAY ARRAY[
      $q$SELECT public.create_household('x')$q$,
      format('SELECT * FROM public.create_invite(%L)', v_hid),
      format('SELECT * FROM public.join_household(%L)', v_tok),
      format('SELECT public.leave_household(%L)', v_hid),
      format('SELECT * FROM public.household_members_view(%L)', v_hid),
      format('SELECT public.household_leave_internal(%L, %L)', c, v_hid),
      format('SELECT public.is_household_member(%L)', v_hid)] LOOP
    v_err := pg_temp.raises(v_t);
    ASSERT v_err LIKE '42501%', format('anon ran %s: %s', v_t, coalesce(v_err, 'succeeded'));
  END LOOP;
  PERFORM pg_temp.act_as(c);
  v_err := pg_temp.raises(format('SELECT public.household_leave_internal(%L, %L)', d, v_hid));
  ASSERT v_err LIKE '42501%', format('authenticated ran household_leave_internal: %s', coalesce(v_err, 'succeeded'));
  RAISE NOTICE '14 ok: anon reads 0 rows from all six tables and can execute none of the seven functions; household_leave_internal closed to authenticated';

  -- 15. growth_events and profiles CHECKs ------------------------------------------
  PERFORM pg_temp.act_as_admin();
  INSERT INTO public.growth_events (event_name, object_type, object_id, metadata)
  VALUES ('household_joined', 'list', v_wid::text, jsonb_build_object('household_id', v_hid));
  v_err := pg_temp.raises($q$INSERT INTO public.growth_events (event_name) VALUES ('household_left')$q$);
  ASSERT v_err LIKE '23514%', format('unknown event name: %s', v_err);
  v_err := pg_temp.raises(format($q$UPDATE public.profiles SET username = 'Bad Name' WHERE id = %L$q$, c));
  ASSERT v_err LIKE '23514%', format('invalid username: %s', v_err);
  FOREACH v_t IN ARRAY ARRAY['a..b', 'Upper', 'ab', 'abcdefghijklmnopqrstu', '_lead', 'trail.', 'has-hyphen'] LOOP
    v_err := pg_temp.raises(format('UPDATE public.profiles SET username = %L WHERE id = %L', v_t, c));
    ASSERT v_err LIKE '23514%', format('username %s accepted: %s', v_t, coalesce(v_err, 'succeeded'));
  END LOOP;
  UPDATE public.profiles SET username = 'abcdefghijklmnopqrst' WHERE id = f;   -- 20 chars
  UPDATE public.profiles SET username = 'user_0f8fad5b' WHERE id = c;
  UPDATE public.profiles SET username = 'user_0f8fad5bd9cb469fa16570867728950e' WHERE id = d;
  UPDATE public.profiles SET username = 'ok.name_1' WHERE id = e;
  RAISE NOTICE '15 ok: household_joined accepted, unknown event refused; username CHECK refuses bad names, accepts both placeholder forms';

  -- 16. An account removed outside delete_own_account (Studio, Auth admin
  --     API) still follows D12, through the profiles BEFORE DELETE trigger.
  DELETE FROM auth.users WHERE id = c;          -- owner of the shared household
  ASSERT (SELECT owner_id FROM public.households WHERE id = v_hid) = d, 'shared household did not pass to D on a direct delete';
  ASSERT (SELECT role FROM public.household_members WHERE household_id = v_hid AND user_id = d) = 'owner', 'D role not owner';
  DELETE FROM auth.users WHERE id = a;          -- sole owner of Two and Three
  ASSERT NOT EXISTS (SELECT 1 FROM public.households WHERE owner_id = a), 'A''s sole households survived';
  ASSERT (SELECT count(*) FROM public.households WHERE id = v_hid) = 1, 'shared household lost';
  RAISE NOTICE '16 ok: direct auth.users delete passes ownership (C to D) and removes sole-owner households';

  RAISE NOTICE 'verify-093: all checks passed';
END $$;

ROLLBACK;
