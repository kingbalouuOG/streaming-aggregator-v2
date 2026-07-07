-- ============================================
-- H0 Stream B — Notifications v1 (Phase 1)
-- Migration 055 — user_push_tokens
-- ============================================
--
-- Stores one row per (device, Expo push token) so the daily
-- send-notifications Edge Function can fan arrival / leaving-soon
-- alerts out to a user's devices.
--
-- CONSENT MODEL (see docs/legal/notifications-data-model.md):
--   The EXISTENCE of a row here IS the record of OS-level push consent.
--   An Expo push token cannot be minted without the user granting the
--   OS notification permission, so a live row == "user opted in on this
--   device". Withdrawal deletes the row (sign-out, OS-permission revoke,
--   or the in-app toggle turning every type off). Per-TYPE preferences
--   (arrivals vs leaving-soon) live separately in notification_preferences
--   (migration 056); this table is the transport layer, that one is intent.
--
-- Device metadata is deliberately MINIMAL (platform + optional coarse
-- label + app version) — no advertising IDs, no location, no hardware
-- fingerprint. Retention: pruned when the token goes dead (Expo push
-- receipt says DeviceNotRegistered) or on account deletion (CASCADE).

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  -- Minimal device metadata. device_id is Expo's install id (not a
  -- hardware/advertising id) — lets us collapse duplicate tokens per
  -- physical install. Both label + version are optional and coarse.
  device_id       TEXT,
  device_name     TEXT,
  app_version     TEXT,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per physical token. Re-registration (refresh, or the same
  -- token seen for a different signed-in user) UPSERTs on this key,
  -- moving ownership + bumping last_seen_at rather than duplicating.
  UNIQUE (expo_push_token)
);

-- Cron fan-out reads "all live tokens for these user_ids".
CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON public.user_push_tokens (user_id);

-- ── Row-level security: owner-only, service_role for the cron ─────────
-- Follows the house RLS pattern (videx-wiki rls-pattern.md): every role
-- class considered explicitly. No anon policy — push tokens are never
-- world-readable.
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push tokens" ON public.user_push_tokens;
CREATE POLICY "Users manage own push tokens"
  ON public.user_push_tokens
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "service_role_all_push_tokens" ON public.user_push_tokens;
CREATE POLICY "service_role_all_push_tokens"
  ON public.user_push_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.user_push_tokens IS
  'Expo push tokens per user device. Row existence = OS push consent (migration 055, H0 Stream B). Minimal device metadata; pruned on dead token / account deletion.';
