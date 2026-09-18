-- =============================================================================
-- 094 — Households: owner removes a member, owner revokes the invite link
--       (Growth G2, session H2; D16 (a), decided 2026-09-18)
--
-- Plan: docs/plans/2026-09-17-004-feat-phase-g2-household-loop-plan.md
-- (§5 row 094, §11b D16).
--
-- 093 had no way for an owner to undo a wrong join: a forwarded invite admits
-- up to six people for seven days, and only the person who joined could leave.
-- Two owner-only RPCs, both additive:
--
--   remove_member(p_household_id, p_user_id)
--     The removed person leaves exactly as leave_household would
--     (household_leave_internal: their reactions there go, the items they
--     added stay with added_by null, their member row goes). The owner cannot
--     remove themselves (they leave instead). The open invite is revoked as
--     well: without that, whoever was removed could rejoin at once from the
--     same link. The owner mints a fresh one to invite anyone else.
--     Codes: not_authenticated, not_owner, cannot_remove_self, not_member.
--
--   revoke_invite(p_household_id) → integer
--     Revokes the open invite(s) without minting a new one. Returns how many
--     were revoked (0 when there was none; not an error).
--     Codes: not_authenticated, not_owner.
--
-- Same shape as 093 §3: SECURITY DEFINER, search_path pinned, message = one
-- code (P0001), EXECUTE for authenticated only. Lock order household, then
-- invites, as everywhere in 093. No table, grant or policy changes, so
-- delete_own_account() / export_user_data() are untouched (IN-PX-54 n/a).
--
-- Apply in Studio (never db push). Then regenerate src/lib/database.types.ts
-- and run supabase/queries/verify-094-household-remove-member.sql (rolls back).
--
-- Reversibility:
--   DROP FUNCTION public.remove_member(uuid, uuid);
--   DROP FUNCTION public.revoke_invite(uuid);
-- =============================================================================

-- remove_member ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.remove_member(uuid, uuid);
CREATE OR REPLACE FUNCTION public.remove_member(p_household_id uuid, p_user_id uuid)
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

  -- Lock the household row (owner check and serialisation with joins,
  -- invites and leaves, which all lock it first).
  PERFORM 1 FROM public.households h
   WHERE h.id = p_household_id AND h.owner_id = v_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  IF p_user_id = v_user_id THEN
    RAISE EXCEPTION 'cannot_remove_self';
  END IF;

  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.household_members m
     WHERE m.household_id = p_household_id AND m.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  -- The removed person is never the owner (checked above), so this never
  -- hands over ownership or deletes the household.
  PERFORM public.household_leave_internal(p_user_id, p_household_id);

  UPDATE public.household_invites i
     SET revoked_at = now()
   WHERE i.household_id = p_household_id
     AND i.revoked_at IS NULL;
END;
$function$;

-- revoke_invite ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.revoke_invite(uuid);
CREATE OR REPLACE FUNCTION public.revoke_invite(p_household_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_count   integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM 1 FROM public.households h
   WHERE h.id = p_household_id AND h.owner_id = v_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  UPDATE public.household_invites i
     SET revoked_at = now()
   WHERE i.household_id = p_household_id
     AND i.revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.remove_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_invite(uuid)       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid)       TO authenticated;

COMMENT ON FUNCTION public.remove_member(uuid, uuid) IS
  'Owner only. Removes a member through household_leave_internal (D12 '
  'semantics) and revokes the open invite. Codes: not_authenticated, '
  'not_owner, cannot_remove_self, not_member. Growth G2, 094.';
COMMENT ON FUNCTION public.revoke_invite(uuid) IS
  'Owner only. Revokes the open invite without minting a new one; returns the '
  'number revoked. Codes: not_authenticated, not_owner. Growth G2, 094.';

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verify after apply (then run supabase/queries/verify-094-household-remove-member.sql):
--   SELECT to_regprocedure('public.remove_member(uuid,uuid)'),
--          to_regprocedure('public.revoke_invite(uuid)');            -- 2 not null
--   SELECT p.proname, p.prosecdef, p.proconfig,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
--     FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace
--      AND p.proname IN ('remove_member', 'revoke_invite');
--     -- prosecdef true, proconfig {search_path=public, pg_temp},
--     -- anon_exec false, auth_exec true
-- Then regenerate src/lib/database.types.ts.
-- =============================================================================
