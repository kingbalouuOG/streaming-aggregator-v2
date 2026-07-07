-- ============================================
-- H0 Stream B — Notifications v1 (Phase 1)
-- Migration 056 — notification_preferences
-- ============================================
--
-- Per-TYPE opt-in state, one row per (user, notification_type). The
-- normalised (type, enabled) shape is deliberate: making leaving-soon a
-- Premium anchor later (strategy §5) is a filter added server-side, NOT
-- a schema change — "gating later is config, not surgery" (brief §Constraints).
--
-- DEFAULT-ON, ABSENCE-MEANS-DEFAULT semantics:
--   A user with a push token but NO row for a type is treated as ENABLED
--   for that type (the OS-permission grant is the meaningful consent; the
--   in-app toggles are a refinement, defaulting on). The client writes a
--   row only when the user actually flips a toggle. The cron therefore
--   filters `WHERE enabled = false` OUT rather than requiring `enabled =
--   true` to exist. Keeps first-run behaviour "granted permission => you
--   get alerts" without forcing a preferences backfill.
--
-- CONSENT UX (client-side, not enforced here): prompt for OS permission
-- AFTER the first value moment (e.g. first watchlist add), never at first
-- launch — privacy-forward tone. See native NotificationsProvider.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('arrival', 'leaving_soon')),
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_type)
);

-- ── Row-level security: owner-only + service_role (cron filters here) ─
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notification prefs" ON public.notification_preferences;
CREATE POLICY "Users manage own notification prefs"
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "service_role_all_notification_prefs" ON public.notification_preferences;
CREATE POLICY "service_role_all_notification_prefs"
  ON public.notification_preferences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.notification_preferences IS
  'Per-type push opt-in (arrival | leaving_soon). Absent row = enabled (default-on). Normalised so future Premium gating of leaving_soon is a server-side filter, not a migration (H0 Stream B, migration 056).';
