-- Verify migration 089 (handle_new_user placeholder username).
--
-- Run in the Studio SQL editor AFTER applying 089. Everything happens in
-- one transaction that ends in ROLLBACK, so no fixture row survives. Any
-- failed ASSERT aborts with the message; success prints four NOTICEs.
-- Fixture emails use the reserved .invalid TLD.

BEGIN;

-- Case A: no username metadata (a provider sign-up) → user_ + 8 hex, not chosen.
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
VALUES ('0f8fad5b-d9cb-469f-a165-70867728950e', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 's3-fixture-a@example.invalid',
        '{"iss":"https://accounts.google.com","full_name":"Fixture A"}'::jsonb, '{"provider":"google"}'::jsonb, now(), now());

-- Case B: email sign-up with a username → used as-is, chosen.
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
VALUES ('7c9e6679-7425-40de-944b-e07fc1f90ae7', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 's3-fixture-b@example.invalid',
        '{"username":"s3fixtureb"}'::jsonb, '{"provider":"email"}'::jsonb, now(), now());

-- Case C: the 8-hex placeholder is already taken → falls back to all 32 hex.
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
VALUES ('a1b2c3d4-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 's3-fixture-c1@example.invalid',
        '{"username":"user_e5f60718"}'::jsonb, '{"provider":"email"}'::jsonb, now(), now());
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
VALUES ('e5f60718-1111-4222-8333-944455556666', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 's3-fixture-c2@example.invalid',
        '{}'::jsonb, '{"provider":"apple"}'::jsonb, now(), now());

-- Case D: a blank username counts as missing.
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
VALUES ('d0d0d0d0-2222-4333-8444-555566667777', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 's3-fixture-d@example.invalid',
        '{"username":"  "}'::jsonb, '{"provider":"email"}'::jsonb, now(), now());

DO $$
DECLARE
  r record;
BEGIN
  SELECT username, username_chosen INTO r FROM public.profiles WHERE id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  ASSERT r.username = 'user_0f8fad5b', format('A: username %s', r.username);
  ASSERT r.username_chosen = false, 'A: username_chosen should be false';
  RAISE NOTICE 'A ok: %', r.username;

  SELECT username, username_chosen INTO r FROM public.profiles WHERE id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  ASSERT r.username = 's3fixtureb', format('B: username %s', r.username);
  ASSERT r.username_chosen = true, 'B: username_chosen should be true';
  RAISE NOTICE 'B ok: %', r.username;

  SELECT username, username_chosen INTO r FROM public.profiles WHERE id = 'e5f60718-1111-4222-8333-944455556666';
  ASSERT r.username = 'user_e5f60718111142228333944455556666', format('C: username %s', r.username);
  ASSERT r.username_chosen = false, 'C: username_chosen should be false';
  RAISE NOTICE 'C ok: %', r.username;

  SELECT username, username_chosen INTO r FROM public.profiles WHERE id = 'd0d0d0d0-2222-4333-8444-555566667777';
  ASSERT r.username = 'user_d0d0d0d0', format('D: username %s', r.username);
  ASSERT r.username_chosen = false, 'D: username_chosen should be false';
  RAISE NOTICE 'D ok: %', r.username;

  -- Existing rows keep the default.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE username_chosen = false
      AND id NOT IN ('0f8fad5b-d9cb-469f-a165-70867728950e', 'e5f60718-1111-4222-8333-944455556666', 'd0d0d0d0-2222-4333-8444-555566667777')
      AND created_at < now() - interval '1 minute'
  ), 'pre-existing profiles should all be username_chosen = true';
END $$;

ROLLBACK;
