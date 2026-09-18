-- Verify migration 094 (remove_member, revoke_invite).
--
-- Run in the Studio SQL editor AFTER applying 093 and 094. Everything happens
-- in one transaction that ends in ROLLBACK, so no fixture row survives. Any
-- failed ASSERT aborts with its message; success prints one NOTICE per step
-- and 'verify-094: all checks passed' last.
--
-- Same rig as verify-093-households.sql: fixture users go straight into
-- auth.users with the reserved .invalid TLD; acting as a user = SET ROLE
-- authenticated plus request.jwt.claims, exactly what PostgREST does.

BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'h2-fixture-' || u.tag || '@example.invalid',
       jsonb_build_object('username', 'h2fix' || u.tag), '{"provider":"email"}'::jsonb, now(), now()
  FROM (VALUES
    ('94000000-0000-4000-8000-00000000000a', 'a'),
    ('94000000-0000-4000-8000-00000000000b', 'b'),
    ('94000000-0000-4000-8000-00000000000c', 'c'),
    ('94000000-0000-4000-8000-00000000000d', 'd')
  ) AS u(id, tag);

INSERT INTO public.profiles (id, username)
SELECT u.id, 'h2fix' || substr(u.email, 12, 1)
  FROM auth.users u
 WHERE u.email LIKE 'h2-fixture-_@example.invalid'
ON CONFLICT (id) DO NOTHING;

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

CREATE FUNCTION pg_temp.raises(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END $f$;

DO $$
DECLARE
  a      constant uuid := '94000000-0000-4000-8000-00000000000a';
  b      constant uuid := '94000000-0000-4000-8000-00000000000b';
  c      constant uuid := '94000000-0000-4000-8000-00000000000c';
  d      constant uuid := '94000000-0000-4000-8000-00000000000d';
  r      record;
  v_hid  uuid;
  v_wid  uuid;
  v_tok  uuid;
  v_item uuid;
  v_err  text;
  v_n    integer;
BEGIN
  -- 1. Fixture: A owns a household, B and C join through one invite ----------
  PERFORM pg_temp.act_as(a);
  SELECT * INTO r FROM public.create_household('Remove test');
  v_hid := r.household_id;
  v_wid := r.watchlist_id;
  SELECT * INTO r FROM public.create_invite(v_hid);
  v_tok := r.token;
  PERFORM pg_temp.act_as(b); PERFORM public.join_household(v_tok);
  PERFORM pg_temp.act_as(c); PERFORM public.join_household(v_tok);
  -- B adds a title and reacts; A reacts to it too.
  PERFORM pg_temp.act_as(b);
  INSERT INTO public.watchlist_items (watchlist_id, tmdb_id, media_type, title, added_by)
  VALUES (v_wid, 603, 'movie', 'The Matrix', b)
  RETURNING id INTO v_item;
  INSERT INTO public.watchlist_reactions (item_id, user_id, reaction) VALUES (v_item, b, 'tonight');
  PERFORM pg_temp.act_as(a);
  INSERT INTO public.watchlist_reactions (item_id, user_id, reaction) VALUES (v_item, a, 'up');
  PERFORM pg_temp.act_as_admin();
  ASSERT (SELECT count(*) FROM public.household_members WHERE household_id = v_hid) = 3, 'fixture: not 3 members';
  RAISE NOTICE '1 ok: A owns, B and C joined, B added an item and reacted';

  -- 2. Refusals -----------------------------------------------------------------
  PERFORM pg_temp.act_as(b);
  v_err := pg_temp.raises(format('SELECT public.remove_member(%L, %L)', v_hid, c));
  ASSERT v_err = 'P0001 not_owner', format('member removes member: %s', v_err);
  v_err := pg_temp.raises(format('SELECT public.revoke_invite(%L)', v_hid));
  ASSERT v_err = 'P0001 not_owner', format('member revokes: %s', v_err);
  PERFORM pg_temp.act_as(d);
  v_err := pg_temp.raises(format('SELECT public.remove_member(%L, %L)', v_hid, b));
  ASSERT v_err = 'P0001 not_owner', format('outsider removes: %s', v_err);
  PERFORM pg_temp.act_as(a);
  v_err := pg_temp.raises(format('SELECT public.remove_member(%L, %L)', v_hid, a));
  ASSERT v_err = 'P0001 cannot_remove_self', format('owner removes self: %s', v_err);
  v_err := pg_temp.raises(format('SELECT public.remove_member(%L, %L)', v_hid, d));
  ASSERT v_err = 'P0001 not_member', format('owner removes non-member: %s', v_err);
  v_err := pg_temp.raises(format('SELECT public.remove_member(%L, NULL)', v_hid));
  ASSERT v_err = 'P0001 not_member', format('owner removes null: %s', v_err);
  v_err := pg_temp.raises(format('SELECT public.remove_member(%L, %L)', gen_random_uuid(), b));
  ASSERT v_err = 'P0001 not_owner', format('unknown household: %s', v_err);
  RAISE NOTICE '2 ok: not_owner (member, outsider, unknown household), cannot_remove_self, not_member';

  -- 3. A removes B: D12 semantics, the invite is revoked --------------------------
  PERFORM pg_temp.act_as(a);
  PERFORM public.remove_member(v_hid, b);
  PERFORM pg_temp.act_as_admin();
  ASSERT NOT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = v_hid AND user_id = b), 'B still a member';
  ASSERT (SELECT added_by FROM public.watchlist_items WHERE id = v_item) IS NULL, 'B''s item kept added_by';
  ASSERT NOT EXISTS (SELECT 1 FROM public.watchlist_reactions WHERE item_id = v_item AND user_id = b), 'B''s reaction survived';
  ASSERT EXISTS (SELECT 1 FROM public.watchlist_reactions WHERE item_id = v_item AND user_id = a), 'A''s reaction lost';
  ASSERT (SELECT owner_id FROM public.households WHERE id = v_hid) = a, 'ownership moved';
  ASSERT (SELECT revoked_at IS NOT NULL FROM public.household_invites WHERE token = v_tok), 'invite not revoked on removal';
  PERFORM pg_temp.act_as(b);
  ASSERT (SELECT count(*) FROM public.households WHERE id = v_hid) = 0, 'removed B still sees the household';
  ASSERT (SELECT count(*) FROM public.watchlist_items WHERE watchlist_id = v_wid) = 0, 'removed B still sees items';
  v_err := pg_temp.raises(format('SELECT * FROM public.join_household(%L)', v_tok));
  ASSERT v_err = 'P0001 invite_invalid', format('removed B rejoins from the old link: %s', v_err);
  PERFORM pg_temp.act_as(c);
  SELECT count(*) INTO v_n FROM public.household_members_view(v_hid);
  ASSERT v_n = 2, format('members_view after removal: %s rows, want 2', v_n);
  RAISE NOTICE '3 ok: B removed (reactions gone, item kept with added_by null), invite revoked, B cannot rejoin from it';

  -- 4. revoke_invite ----------------------------------------------------------------
  PERFORM pg_temp.act_as(a);
  ASSERT public.revoke_invite(v_hid) = 0, 'revoke with no open invite did not return 0';
  SELECT * INTO r FROM public.create_invite(v_hid);
  v_tok := r.token;
  ASSERT public.revoke_invite(v_hid) = 1, 'revoke did not return 1';
  ASSERT public.revoke_invite(v_hid) = 0, 'second revoke did not return 0';
  PERFORM pg_temp.act_as(d);
  v_err := pg_temp.raises(format('SELECT * FROM public.join_household(%L)', v_tok));
  ASSERT v_err = 'P0001 invite_invalid', format('join with revoked invite: %s', v_err);
  -- C, still a member, replays the revoked link: idempotent, not an error.
  PERFORM pg_temp.act_as(c);
  SELECT * INTO r FROM public.join_household(v_tok);
  ASSERT r.already_member, 'member replay of a revoked link errored or rejoined';
  RAISE NOTICE '4 ok: revoke_invite returns 1 then 0; a revoked link refuses newcomers, replays for members';

  -- 5. anon can execute neither; authenticated without a sub is not_authenticated -
  PERFORM pg_temp.act_as_anon();
  v_err := pg_temp.raises(format('SELECT public.remove_member(%L, %L)', v_hid, c));
  ASSERT v_err LIKE '42501%', format('anon ran remove_member: %s', coalesce(v_err, 'succeeded'));
  v_err := pg_temp.raises(format('SELECT public.revoke_invite(%L)', v_hid));
  ASSERT v_err LIKE '42501%', format('anon ran revoke_invite: %s', coalesce(v_err, 'succeeded'));
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  v_err := pg_temp.raises(format('SELECT public.revoke_invite(%L)', v_hid));
  ASSERT v_err = 'P0001 not_authenticated', format('no sub: %s', v_err);
  RAISE NOTICE '5 ok: anon refused (42501); no auth.uid() is not_authenticated';

  -- 6. Definer settings -----------------------------------------------------------
  PERFORM pg_temp.act_as_admin();
  SELECT count(*) INTO v_n
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('remove_member', 'revoke_invite')
     AND p.prosecdef
     AND p.proconfig @> ARRAY['search_path=public, pg_temp']
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  ASSERT v_n = 2, format('definer/search_path/grants wrong on %s of 2 functions', 2 - v_n);
  RAISE NOTICE '6 ok: both SECURITY DEFINER, search_path pinned, EXECUTE authenticated only';

  RAISE NOTICE 'verify-094: all checks passed';
END $$;

ROLLBACK;
