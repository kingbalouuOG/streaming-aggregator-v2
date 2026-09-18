-- =============================================================================
-- 093 — Households: shared watchlists, membership RLS, invite/join RPCs
--       (Growth G2, session H1)
--
-- Plan: docs/plans/2026-09-17-004-feat-phase-g2-household-loop-plan.md
-- (§5 row 093; decisions D1–D7, D11–D13 accepted as recommended 2026-09-18).
--
-- What this adds, all additive:
--   §1 six tables: households, household_members, watchlists, watchlist_items,
--      watchlist_reactions, household_invites. RLS on every one; anon granted
--      nothing.
--   §2 is_household_member(hid), the one membership helper every policy
--      uses, and the first membership policies in the codebase.
--   §3 five RPCs for the edges (create_household, create_invite,
--      join_household, leave_household, household_members_view) plus the
--      internal household_leave_internal that delete_own_account shares.
--   §4 delete_own_account() / export_user_data() re-emitted wholesale from
--      092 (IN-PX-54). Export version 1.3 → 1.4 (three new keys).
--   §5 growth_events.event_name CHECK gains 'household_joined' (D13).
--   §6 profiles.username CHECK mirroring src/lib/auth/username.ts length and
--      charset (IN-GR-043). Live scan 2026-09-18: 0 of 18 rows violate, so
--      the constraint is added VALID.
--
-- NOT touched: the personal public.watchlist table (D1). Its live definition
-- is recorded below as a comment only.
--
-- Error contract: every RPC failure is RAISE EXCEPTION with the message set
-- to exactly one stable code (errcode P0001). The app maps codes to copy:
--   not_authenticated, invalid_name, household_limit, not_owner,
--   rate_limited, invite_invalid, invite_expired, invite_exhausted,
--   household_full, not_member.
--
-- Apply in Studio (never db push). Then regenerate src/lib/database.types.ts
-- and run supabase/queries/verify-093-households.sql (rolls back).
--
-- Reversibility (no data outside the new tables is changed):
--   DROP TABLE public.watchlist_reactions, public.watchlist_items,
--              public.watchlists, public.household_invites,
--              public.household_members, public.households;
--   DROP FUNCTION the seven functions in §2–§3 and the reactions touch fn;
--   re-apply 092 §1–§2 (previous delete/export bodies);
--   re-add the 090 event_name CHECK (8 names);
--   ALTER TABLE public.profiles DROP CONSTRAINT profiles_username_format_check;
-- =============================================================================

-- =============================================================================
-- Live watchlist definition captured 2026-09-18 (read-only; not altered by
-- this migration). Re-run supabase/queries/capture-watchlist-ddl.sql to
-- refresh. The table predates the migration series; this is the only
-- record of it in the repo.
--
--   Columns: id uuid NOT NULL DEFAULT gen_random_uuid(),
--            user_id uuid NOT NULL, tmdb_id integer NOT NULL,
--            media_type text NOT NULL, status text NOT NULL,
--            rating text NULL, title text NULL, poster_path text NULL,
--            added_at timestamptz NULL DEFAULT now(),
--            updated_at timestamptz NULL DEFAULT now(),
--            genre_ids ARRAY NULL
--   Constraints:
--     watchlist_pkey                           PRIMARY KEY (id)
--     watchlist_user_id_tmdb_id_media_type_key UNIQUE (user_id, tmdb_id, media_type)
--     watchlist_user_id_fkey                   FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
--     watchlist_media_type_check               CHECK (media_type = ANY (ARRAY['movie','tv']))
--     watchlist_status_check                   CHECK (status = ANY (ARRAY['want_to_watch','watched']))
--     watchlist_rating_check                   CHECK (rating = ANY (ARRAY['thumbs_up','thumbs_down']))
--   Indexes:
--     watchlist_pkey                           UNIQUE btree (id)
--     watchlist_user_id_tmdb_id_media_type_key UNIQUE btree (user_id, tmdb_id, media_type)
--     idx_watchlist_user_status                btree (user_id, status)
--   RLS: enabled, not forced. Policies (both PERMISSIVE, FOR ALL, TO public):
--     "Users access own rows"          USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
--     "Users can manage own watchlist" USING (auth.uid() = user_id)  (no WITH CHECK)
--   Grants: anon, authenticated, postgres, service_role each hold
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     (Supabase default privileges; RLS is the fence).
--   Triggers: none.
-- =============================================================================

-- =============================================================================
-- 1. Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.households (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.households IS
  'A group of people sharing one list (Growth G2, migration 093). Created only '
  'by create_household(); members read it, the owner may rename it.';

CREATE INDEX IF NOT EXISTS households_owner_id_idx
  ON public.households (owner_id);

CREATE TABLE IF NOT EXISTS public.household_members (
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

COMMENT ON TABLE public.household_members IS
  'Membership (Growth G2, 093). Written only by the RPCs; cap 6 per household '
  '(join_household). A person may belong to several households.';

CREATE INDEX IF NOT EXISTS household_members_user_id_idx
  ON public.household_members (user_id);

CREATE TABLE IF NOT EXISTS public.watchlists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'Shared' CHECK (char_length(name) BETWEEN 1 AND 40),
  created_by    UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No one-list-per-household constraint on purpose (D3): v1 creates exactly
-- one through create_household and the app never creates a second.
COMMENT ON TABLE public.watchlists IS
  'Shared lists (Growth G2, 093). Not the personal public.watchlist. v1: one '
  'per household, created by create_household().';

CREATE INDEX IF NOT EXISTS watchlists_household_id_idx
  ON public.watchlists (household_id);

CREATE TABLE IF NOT EXISTS public.watchlist_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id  UUID NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  tmdb_id       INTEGER NOT NULL,
  media_type    TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title         TEXT NOT NULL,
  poster_path   TEXT NULL,
  -- Nulled when the adder leaves or deletes their account; the item stays (D12).
  added_by      UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, tmdb_id, media_type)
);

COMMENT ON TABLE public.watchlist_items IS
  'Titles on a shared list (Growth G2, 093). Members insert with added_by = '
  'themselves; the adder or the household owner deletes.';

CREATE INDEX IF NOT EXISTS watchlist_items_added_by_idx
  ON public.watchlist_items (added_by);

CREATE TABLE IF NOT EXISTS public.watchlist_reactions (
  item_id     UUID NOT NULL REFERENCES public.watchlist_items(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction    TEXT NOT NULL CHECK (reaction IN ('up', 'down', 'tonight')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

COMMENT ON TABLE public.watchlist_reactions IS
  'One reaction per member per shared item: up, down or tonight (D11). '
  'Growth G2, 093.';

CREATE INDEX IF NOT EXISTS watchlist_reactions_user_id_idx
  ON public.watchlist_reactions (user_id);

CREATE OR REPLACE FUNCTION public.touch_watchlist_reactions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS watchlist_reactions_touch_updated_at ON public.watchlist_reactions;
CREATE TRIGGER watchlist_reactions_touch_updated_at
  BEFORE UPDATE ON public.watchlist_reactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_watchlist_reactions_updated_at();

CREATE TABLE IF NOT EXISTS public.household_invites (
  -- Server-minted; possession is the right to join (as claim_push_token, 060).
  token         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  max_uses      INTEGER NOT NULL DEFAULT 6,
  uses          INTEGER NOT NULL DEFAULT 0,
  revoked_at    TIMESTAMPTZ NULL
);

COMMENT ON TABLE public.household_invites IS
  'Invite tokens (Growth G2, 093; D4/D5): 7-day expiry, multi-use up to the '
  'cap, a new invite revokes the old. RLS on with NO policies: read and '
  'written only by create_invite() and join_household().';

CREATE INDEX IF NOT EXISTS household_invites_household_id_idx
  ON public.household_invites (household_id);

-- create_invite's rolling 24h rate limit counts from here.
CREATE INDEX IF NOT EXISTS household_invites_created_by_created_at_idx
  ON public.household_invites (created_by, created_at DESC);

-- =============================================================================
-- 2. Row security (authenticated only). One helper, used by every policy.
-- =============================================================================

ALTER TABLE public.households          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites   ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER so the household_members lookup bypasses that table's own
-- policy (which calls this function: no recursion). STABLE, search_path
-- pinned. Returns false for anon (auth.uid() null).
CREATE OR REPLACE FUNCTION public.is_household_member(hid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members m
     WHERE m.household_id = hid
       AND m.user_id = auth.uid()
  );
$function$;

COMMENT ON FUNCTION public.is_household_member(uuid) IS
  'True when auth.uid() is a member of household hid. The one membership test '
  'every 093 policy uses (Growth G2).';

REVOKE ALL ON FUNCTION public.is_household_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid) TO authenticated, service_role;

-- Grants (088 style): nothing for anon, only the verbs each table needs for
-- authenticated. service_role keeps its default privileges.
REVOKE ALL ON public.households, public.household_members, public.watchlists,
              public.watchlist_items, public.watchlist_reactions,
              public.household_invites
  FROM PUBLIC, anon, authenticated;

GRANT SELECT               ON public.households          TO authenticated;
GRANT UPDATE (name)        ON public.households          TO authenticated;  -- rename only
GRANT SELECT               ON public.household_members   TO authenticated;
GRANT SELECT               ON public.watchlists          TO authenticated;
GRANT SELECT, DELETE       ON public.watchlist_items     TO authenticated;
-- id and added_at always take their defaults; no UPDATE in v1.
GRANT INSERT (watchlist_id, tmdb_id, media_type, title, poster_path, added_by)
                           ON public.watchlist_items     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist_reactions TO authenticated;
-- household_invites: no grant at all.

-- households ------------------------------------------------------------------
DROP POLICY IF EXISTS households_select_member ON public.households;
CREATE POLICY households_select_member ON public.households
  FOR SELECT TO authenticated
  USING (public.is_household_member(id));

DROP POLICY IF EXISTS households_update_owner ON public.households;
CREATE POLICY households_update_owner ON public.households
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND public.is_household_member(id))
  WITH CHECK (owner_id = (SELECT auth.uid()));

-- household_members -----------------------------------------------------------
DROP POLICY IF EXISTS household_members_select_member ON public.household_members;
CREATE POLICY household_members_select_member ON public.household_members
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

-- watchlists ------------------------------------------------------------------
DROP POLICY IF EXISTS watchlists_select_member ON public.watchlists;
CREATE POLICY watchlists_select_member ON public.watchlists
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

-- watchlist_items -------------------------------------------------------------
-- The child-table shape: an uncorrelated IN over the lists the caller can
-- see, so the planner builds the set once (hashed subplan), not per row.
DROP POLICY IF EXISTS watchlist_items_select_member ON public.watchlist_items;
CREATE POLICY watchlist_items_select_member ON public.watchlist_items
  FOR SELECT TO authenticated
  USING (watchlist_id IN (
    SELECT w.id FROM public.watchlists w
     WHERE public.is_household_member(w.household_id)
  ));

DROP POLICY IF EXISTS watchlist_items_insert_member ON public.watchlist_items;
CREATE POLICY watchlist_items_insert_member ON public.watchlist_items
  FOR INSERT TO authenticated
  WITH CHECK (
    added_by = (SELECT auth.uid())
    AND watchlist_id IN (
      SELECT w.id FROM public.watchlists w
       WHERE public.is_household_member(w.household_id)
    )
  );

DROP POLICY IF EXISTS watchlist_items_delete_adder_or_owner ON public.watchlist_items;
CREATE POLICY watchlist_items_delete_adder_or_owner ON public.watchlist_items
  FOR DELETE TO authenticated
  USING (
    watchlist_id IN (
      SELECT w.id FROM public.watchlists w
       WHERE public.is_household_member(w.household_id)
    )
    AND (
      added_by = (SELECT auth.uid())
      OR watchlist_id IN (
        SELECT w.id FROM public.watchlists w
          JOIN public.households h ON h.id = w.household_id
         WHERE h.owner_id = (SELECT auth.uid())
      )
    )
  );

-- watchlist_reactions ---------------------------------------------------------
DROP POLICY IF EXISTS watchlist_reactions_select_member ON public.watchlist_reactions;
CREATE POLICY watchlist_reactions_select_member ON public.watchlist_reactions
  FOR SELECT TO authenticated
  USING (item_id IN (
    SELECT i.id FROM public.watchlist_items i
      JOIN public.watchlists w ON w.id = i.watchlist_id
     WHERE public.is_household_member(w.household_id)
  ));

DROP POLICY IF EXISTS watchlist_reactions_insert_own ON public.watchlist_reactions;
CREATE POLICY watchlist_reactions_insert_own ON public.watchlist_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND item_id IN (
      SELECT i.id FROM public.watchlist_items i
        JOIN public.watchlists w ON w.id = i.watchlist_id
       WHERE public.is_household_member(w.household_id)
    )
  );

DROP POLICY IF EXISTS watchlist_reactions_update_own ON public.watchlist_reactions;
CREATE POLICY watchlist_reactions_update_own ON public.watchlist_reactions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND item_id IN (
      SELECT i.id FROM public.watchlist_items i
        JOIN public.watchlists w ON w.id = i.watchlist_id
       WHERE public.is_household_member(w.household_id)
    )
  );

DROP POLICY IF EXISTS watchlist_reactions_delete_own ON public.watchlist_reactions;
CREATE POLICY watchlist_reactions_delete_own ON public.watchlist_reactions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- household_invites: RLS on, deliberately no policy.

-- =============================================================================
-- 3. RPCs. SECURITY DEFINER, search_path pinned, EXECUTE for authenticated
--    only. #variable_conflict use_column because OUT names (household_id,
--    token, expires_at, …) are also column names; every column is qualified.
-- =============================================================================

-- create_household ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_household(text);
CREATE OR REPLACE FUNCTION public.create_household(p_name text)
RETURNS TABLE (household_id uuid, watchlist_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
  v_name    text := btrim(coalesce(p_name, ''));
  v_hid     uuid;
  v_wid     uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  -- Serialise concurrent creates by the same person so the cap holds.
  PERFORM pg_advisory_xact_lock(hashtextextended('create_household:' || v_user_id::text, 0));
  IF (SELECT count(*) FROM public.households h WHERE h.owner_id = v_user_id) >= 3 THEN
    RAISE EXCEPTION 'household_limit';
  END IF;

  INSERT INTO public.households AS h (name, owner_id)
  VALUES (v_name, v_user_id)
  RETURNING h.id INTO v_hid;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_hid, v_user_id, 'owner');

  INSERT INTO public.watchlists AS w (household_id, name, created_by)
  VALUES (v_hid, 'Shared', v_user_id)
  RETURNING w.id INTO v_wid;

  RETURN QUERY SELECT v_hid, v_wid;
END;
$function$;

-- create_invite ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_invite(uuid);
CREATE OR REPLACE FUNCTION public.create_invite(p_household_id uuid)
RETURNS TABLE (token uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
  v_token   uuid;
  v_expires timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Lock the household row: serialises concurrent mints for one household.
  PERFORM 1 FROM public.households h
   WHERE h.id = p_household_id AND h.owner_id = v_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  IF (SELECT count(*) FROM public.household_invites i
       WHERE i.created_by = v_user_id
         AND i.created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- A new invite replaces the old (D5).
  UPDATE public.household_invites i
     SET revoked_at = now()
   WHERE i.household_id = p_household_id
     AND i.revoked_at IS NULL;

  INSERT INTO public.household_invites AS i (household_id, created_by)
  VALUES (p_household_id, v_user_id)
  RETURNING i.token, i.expires_at INTO v_token, v_expires;

  RETURN QUERY SELECT v_token, v_expires;
END;
$function$;

-- join_household --------------------------------------------------------------
-- The caller is auth.uid() only; the token is the proof of right (060).
-- An existing member is answered before the token's state is judged, so a
-- replayed link (pending-link resume, a retry after the last use, an invite
-- the owner has since replaced) is idempotent rather than an error. That
-- tells a member nothing they do not know: the household is theirs.
DROP FUNCTION IF EXISTS public.join_household(uuid);
CREATE OR REPLACE FUNCTION public.join_household(p_token uuid)
RETURNS TABLE (household_id uuid, watchlist_id uuid, already_member boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
  v_invite  public.household_invites%ROWTYPE;
  v_wid     uuid;
  v_count   integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT i.* INTO v_invite
    FROM public.household_invites i
   WHERE i.token = p_token
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;

  -- The household's single list (v1); earliest if a later version adds more.
  SELECT w.id INTO v_wid
    FROM public.watchlists w
   WHERE w.household_id = v_invite.household_id
   ORDER BY w.created_at, w.id
   LIMIT 1;

  IF EXISTS (SELECT 1 FROM public.household_members m
              WHERE m.household_id = v_invite.household_id
                AND m.user_id = v_user_id) THEN
    RETURN QUERY SELECT v_invite.household_id, v_wid, true;
    RETURN;
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;
  IF v_invite.uses >= v_invite.max_uses THEN
    RAISE EXCEPTION 'invite_exhausted';
  END IF;

  -- Lock the household so two concurrent joins cannot both pass the cap.
  PERFORM 1 FROM public.households h WHERE h.id = v_invite.household_id FOR UPDATE;
  SELECT count(*) INTO v_count
    FROM public.household_members m
   WHERE m.household_id = v_invite.household_id;
  IF v_count >= 6 THEN
    RAISE EXCEPTION 'household_full';
  END IF;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (v_invite.household_id, v_user_id, 'member');

  UPDATE public.household_invites i
     SET uses = i.uses + 1
   WHERE i.token = p_token;

  RETURN QUERY SELECT v_invite.household_id, v_wid, false;
END;
$function$;

-- household_leave_internal ----------------------------------------------------
-- Shared by leave_household (the caller) and delete_own_account (the account
-- being erased). D12: the leaver's reactions in this household go, the items
-- they added stay with added_by nulled, their member row goes; an owner's
-- leaving passes ownership to the earliest-joined remaining member (whose
-- role becomes 'owner', and outstanding invites are revoked because the
-- person who minted them can no longer revoke them), or deletes the
-- household when nobody remains (cascading lists, items, invites).
-- EXECUTE granted to nobody: callable only from other definer functions.
DROP FUNCTION IF EXISTS public.household_leave_internal(uuid, uuid);
CREATE OR REPLACE FUNCTION public.household_leave_internal(p_user_id uuid, p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_owner uuid;
  v_next  uuid;
BEGIN
  SELECT h.owner_id INTO v_owner
    FROM public.households h
   WHERE h.id = p_household_id
   FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.household_members m
     WHERE m.household_id = p_household_id AND m.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  DELETE FROM public.watchlist_reactions r
   USING public.watchlist_items i, public.watchlists w
   WHERE r.item_id = i.id
     AND i.watchlist_id = w.id
     AND w.household_id = p_household_id
     AND r.user_id = p_user_id;

  UPDATE public.watchlist_items i
     SET added_by = NULL
    FROM public.watchlists w
   WHERE i.watchlist_id = w.id
     AND w.household_id = p_household_id
     AND i.added_by = p_user_id;

  DELETE FROM public.household_members m
   WHERE m.household_id = p_household_id
     AND m.user_id = p_user_id;

  IF v_owner = p_user_id THEN
    SELECT m.user_id INTO v_next
      FROM public.household_members m
     WHERE m.household_id = p_household_id
     ORDER BY m.joined_at, m.user_id
     LIMIT 1;

    IF v_next IS NULL THEN
      DELETE FROM public.households h WHERE h.id = p_household_id;
    ELSE
      UPDATE public.households h SET owner_id = v_next WHERE h.id = p_household_id;
      UPDATE public.household_members m
         SET role = 'owner'
       WHERE m.household_id = p_household_id AND m.user_id = v_next;
      UPDATE public.household_invites i
         SET revoked_at = now()
       WHERE i.household_id = p_household_id AND i.revoked_at IS NULL;
    END IF;
  END IF;
END;
$function$;

-- leave_household -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.leave_household(uuid);
CREATE OR REPLACE FUNCTION public.leave_household(p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  PERFORM public.household_leave_internal(v_user_id, p_household_id);
END;
$function$;

-- household_members_view ------------------------------------------------------
-- Co-member names (D7): usernames only, no email, no display name.
DROP FUNCTION IF EXISTS public.household_members_view(uuid);
CREATE OR REPLACE FUNCTION public.household_members_view(p_household_id uuid)
RETURNS TABLE (user_id uuid, username text, role text, joined_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.household_members m
                  WHERE m.household_id = p_household_id AND m.user_id = v_user_id) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  RETURN QUERY
    SELECT m.user_id, p.username, m.role, m.joined_at
      FROM public.household_members m
      JOIN public.profiles p ON p.id = m.user_id
     WHERE m.household_id = p_household_id
     ORDER BY m.joined_at, m.user_id;
END;
$function$;

-- Grants. An explicit REVOKE on a function does stick (live check
-- 2026-09-18: claim_push_token has no anon or PUBLIC EXECUTE), so these are
-- real fences, with the auth.uid() check in each body as the second.
REVOKE ALL ON FUNCTION public.create_household(text)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_invite(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_household(uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_household(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.household_members_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household(text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invite(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_household(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_household(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.household_members_view(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.household_leave_internal(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.touch_watchlist_reactions_updated_at() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.create_household(text) IS
  'Creates a household owned by the caller, the owner member row and its one '
  'list (''Shared''). Max 3 owned. Codes: not_authenticated, invalid_name, '
  'household_limit. Growth G2, 093.';
COMMENT ON FUNCTION public.create_invite(uuid) IS
  'Owner only. Revokes the active invite and mints a new token (7 days, '
  '6 uses). Max 10 per owner per rolling 24h. Codes: not_authenticated, '
  'not_owner, rate_limited. Growth G2, 093.';
COMMENT ON FUNCTION public.join_household(uuid) IS
  'Joins the caller to the token''s household (idempotent for members). '
  'Codes in order: not_authenticated, invite_invalid, invite_expired, '
  'invite_exhausted, household_full. Growth G2, 093.';
COMMENT ON FUNCTION public.leave_household(uuid) IS
  'Caller leaves: reactions there deleted, their items kept with added_by '
  'null, ownership to the earliest member or the household deleted if empty. '
  'Codes: not_authenticated, not_member. Growth G2, 093.';
COMMENT ON FUNCTION public.household_members_view(uuid) IS
  'Members of a household the caller belongs to: user_id, username, role, '
  'joined_at. Codes: not_authenticated, not_member. Growth G2, 093.';
COMMENT ON FUNCTION public.household_leave_internal(uuid, uuid) IS
  'Leave logic shared by leave_household and delete_own_account. No EXECUTE '
  'grant: definer callers only. Growth G2, 093.';

-- =============================================================================
-- 4. delete_own_account() — re-emitted wholesale from 092 with households.
--    CREATE OR REPLACE without DROP keeps the existing grants.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_hid     uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_own_account called without auth.uid()';
  END IF;

  -- Growth G2 / migration 093. Leave every household first so D12 holds:
  -- a sole owner's household is deleted, otherwise ownership passes to the
  -- earliest-joined member (without this the profiles cascade on
  -- households.owner_id would delete the household under its members);
  -- reactions go, the account's items stay with added_by nulled.
  FOR v_hid IN
    SELECT m.household_id FROM public.household_members m
     WHERE m.user_id = v_user_id
     ORDER BY m.joined_at
  LOOP
    PERFORM public.household_leave_internal(v_user_id, v_hid);
  END LOOP;

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
  DELETE FROM public.watchlist_reactions WHERE user_id = v_user_id;          -- 093
  UPDATE public.watchlist_items SET added_by = NULL WHERE added_by = v_user_id;  -- 093
  DELETE FROM public.household_invites   WHERE created_by = v_user_id;       -- 093
  DELETE FROM public.household_members   WHERE user_id = v_user_id;          -- 093

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
-- 5. export_user_data() — re-emitted wholesale from 092 with the caller's
--    memberships, the shared items they added and their reactions. Version
--    1.3 → 1.4 (three new keys). The 092 install-id scoping is unchanged.
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
      'version',      '1.4',
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
    ), '[]'::jsonb),
    -- Growth G2 / migration 093: the caller's memberships, the shared items
    -- they added and their reactions. Other members' rows are theirs. --
    'households', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', h.id, 'name', h.name, 'role', m.role, 'joined_at', m.joined_at
             ) ORDER BY m.joined_at)
        FROM public.household_members m
        JOIN public.households h ON h.id = m.household_id
       WHERE m.user_id = v_user_id
    ), '[]'::jsonb),
    'watchlist_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'watchlist_id', i.watchlist_id, 'tmdb_id', i.tmdb_id,
               'media_type', i.media_type, 'title', i.title, 'added_at', i.added_at
             ) ORDER BY i.added_at)
        FROM public.watchlist_items i
       WHERE i.added_by = v_user_id
    ), '[]'::jsonb),
    'watchlist_reactions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'item_id', r.item_id, 'reaction', r.reaction, 'created_at', r.created_at
             ) ORDER BY r.created_at)
        FROM public.watchlist_reactions r
       WHERE r.user_id = v_user_id
    ), '[]'::jsonb)
  )
  INTO v_payload;

  RETURN v_payload;
END;
$function$;

-- =============================================================================
-- 6. growth_events.event_name gains 'household_joined' (D13). Constraint
--    name read live 2026-09-18: growth_events_event_name_check.
-- =============================================================================

ALTER TABLE public.growth_events DROP CONSTRAINT IF EXISTS growth_events_event_name_check;
ALTER TABLE public.growth_events ADD CONSTRAINT growth_events_event_name_check
  CHECK (event_name IN (
    'preview_fetched',
    'preview_opened',
    'link_opened',
    'first_open',
    'signup_completed',
    'share_initiated',
    'share_completed',
    'notification_opened',
    'household_joined'
  ));

-- =============================================================================
-- 7. profiles.username format (IN-GR-043). Mirrors src/lib/auth/username.ts
--    exactly on length and charset: 3–20 chars; a–z, 0–9, '_' and '.';
--    starts and ends with a letter or digit; no two separators in a row.
--    The reserved placeholder rule stays client and RPC side, but the 089
--    placeholders must pass: 'user_' + 8 hex fits the rule as written;
--    'user_' + 32 hex (089's collision fallback, 37 chars) is allowed by
--    name. Live scan 2026-09-18: 0 of 18 rows violate → added VALID.
--    handle_new_user inserts a supplied sign-up name as-is, so a name the
--    client rule refuses now fails the sign-up instead of landing.
-- =============================================================================

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format_check
  CHECK (
    username ~ '^[a-z0-9]([a-z0-9_.]*[a-z0-9])?$'
    AND username !~ '[_.]{2}'
    AND (
      char_length(username) BETWEEN 3 AND 20
      OR username ~ '^user_[0-9a-f]{32}$'
    )
  );

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verify after apply (then run supabase/queries/verify-093-households.sql):
--   SELECT c, to_regclass('public.' || c) FROM unnest(array['households',
--     'household_members','watchlists','watchlist_items','watchlist_reactions',
--     'household_invites']) c;                                      -- 6 not null
--   SELECT to_regprocedure('public.is_household_member(uuid)'),
--          to_regprocedure('public.create_household(text)'),
--          to_regprocedure('public.create_invite(uuid)'),
--          to_regprocedure('public.join_household(uuid)'),
--          to_regprocedure('public.leave_household(uuid)'),
--          to_regprocedure('public.household_members_view(uuid)'),
--          to_regprocedure('public.household_leave_internal(uuid,uuid)');  -- 7 not null
--   SELECT tablename, count(*) FROM pg_policies WHERE tablename IN (…) GROUP BY 1;
--     households 2, household_members 1, watchlists 1, watchlist_items 3,
--     watchlist_reactions 4, household_invites 0
-- Then regenerate src/lib/database.types.ts.
-- =============================================================================
