-- ============================================
-- H0 audit fix batch — claim_push_token
-- Migration 060
-- ============================================
--
-- Fixes an RLS-blocked ownership-move bug in push-token registration.
--
-- The bug: `user_push_tokens` is UNIQUE(expo_push_token) and the client
-- upserts on that key so a re-registration "moves" the token row to the
-- current user (migration 055's design intent). But the owner-only RLS
-- policy (USING user_id = auth.uid()) makes that move impossible from
-- the client: if user A signed out OFFLINE (clearPushToken's DELETE
-- never reached the server) or the app was reinstalled, A's stale row
-- survives — and when user B signs in on the same device, B's upsert
-- has to UPDATE a row B doesn't own. RLS hides that row, the upsert
-- fails, and the net effect is a cross-account leak: A's alerts keep
-- being delivered to what is now B's device.
--
-- The fix: a SECURITY DEFINER RPC that claims the token row for the
-- CALLING user regardless of previous owner. Safe because possession
-- of the Expo push token IS proof of control of the device (tokens are
-- opaque, device-minted, and unguessable), and the row's existence is
-- the consent record (055 header) — whoever holds the device holds the
-- consent.
--
-- Signature handling: DROP FUNCTION IF EXISTS before CREATE OR REPLACE
-- so a future signature change doesn't error (migration 042 convention).
--
-- Permissions: SECURITY DEFINER + search_path pinned (Postgres CVE
-- hardening per migration 027 convention). Anon cannot call; the
-- functional gate is the auth.uid() NULL check in the body (see the
-- REVOKE note at the bottom — Supabase re-grants EXECUTE on public.*
-- functions, so the in-body RAISE is the real fence).
--
-- Verification (run post-apply):
--   -- As user B (JWT), with a row owned by user A for the same token:
--   SELECT public.claim_push_token('ExponentPushToken[test]', 'android', 'Pixel 7');
--   SELECT user_id FROM public.user_push_tokens
--     WHERE expo_push_token = 'ExponentPushToken[test]';  -- now B
--
-- Reversibility: DROP FUNCTION public.claim_push_token(text, text, text, text);
-- the client-side upsert path can be restored from git (native/src/notifications/push.ts).

DROP FUNCTION IF EXISTS public.claim_push_token(text, text, text, text);

CREATE OR REPLACE FUNCTION public.claim_push_token(
  p_expo_push_token text,
  p_platform        text,
  p_device_name     text DEFAULT NULL,
  p_app_version     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'claim_push_token called without auth.uid()';
  END IF;

  INSERT INTO public.user_push_tokens
    (user_id, expo_push_token, platform, device_name, app_version, last_seen_at, updated_at)
  VALUES
    (v_user_id, p_expo_push_token, p_platform, p_device_name, p_app_version, now(), now())
  ON CONFLICT (expo_push_token) DO UPDATE SET
    user_id      = v_user_id,        -- the claim: move ownership to the caller
    platform     = excluded.platform,
    device_name  = excluded.device_name,
    app_version  = excluded.app_version,
    last_seen_at = now(),
    updated_at   = now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_push_token(text, text, text, text)
  TO authenticated, service_role;
-- The REVOKE below documents intent: anon should not have EXECUTE on
-- this RPC. Supabase auto-grants EXECUTE to anon/authenticated/service_role
-- on every public.* function so PostgREST can route to it, and that
-- auto-grant undoes our REVOKE on the next reapply / session. The
-- functional auth gate is the `IF v_user_id IS NULL THEN RAISE` check
-- in the function body — anon calls fail before any write runs.
-- Keep the REVOKE for grep-ability (migration 042 convention).
REVOKE EXECUTE ON FUNCTION public.claim_push_token(text, text, text, text) FROM PUBLIC, anon;

COMMENT ON FUNCTION public.claim_push_token(text, text, text, text) IS
  'Registers (or re-claims) an Expo push token row for the calling user, '
  'moving ownership from any previous owner. SECURITY DEFINER because the '
  'owner-only RLS on user_push_tokens blocks the client upsert from moving '
  'a stale row left by an offline sign-out / reinstall — which otherwise '
  'leaks user A''s alerts to user B''s device. See migration 060 header.';
