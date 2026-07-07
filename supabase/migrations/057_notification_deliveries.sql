-- ============================================
-- H0 Stream B — Notifications v1 (Phase 2)
-- Migration 057 — notification_deliveries (dedup + cap ledger)
-- ============================================
--
-- Append-only ledger of what we've sent. Two jobs:
--   1. DEDUPE — "never notify twice for the same arrival" and leaving-soon
--      "once, at ~7 days out". A UNIQUE index on
--      (user_id, notification_type, tmdb_id, media_type) makes the send
--      path idempotent: the cron INSERTs the intended delivery with
--      ON CONFLICT DO NOTHING and only pushes for rows it actually
--      claimed. A double-fired cron therefore cannot double-notify.
--   2. CAPS — "max ~1/day per user for v1". The cron counts rows for a
--      user in the trailing 24h before deciding to send more.
--
--   Also carries the Expo push ticket/receipt id so a later pass can poll
--   receipts and prune dead tokens (DeviceNotRegistered) from
--   user_push_tokens.
--
-- Re-arrival edge (documented, accepted for v1): a strict per-title unique
-- means a title that leaves a service and genuinely returns months later
-- won't re-alert. Chosen deliberately — v1 biases against spam. If we want
-- re-arrival alerts later, widen the key with an arrival-epoch/bucket.

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('arrival', 'leaving_soon')),
  tmdb_id           INTEGER NOT NULL,
  media_type        TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  service_id        TEXT,               -- which service triggered it (context, not part of dedup key)
  title             TEXT,               -- denormalised for the sent record / debugging
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Expo push delivery tracking (populated after the batch send).
  expo_ticket_id    TEXT,               -- ticket id from POST /push/send
  -- The token this push went to, for receipt-driven dead-token pruning.
  -- Set only when the user has a single device (the common case); NULL for
  -- multi-device users, who fall back to send-time DeviceNotRegistered pruning.
  -- ON DELETE SET NULL so pruning a dead token leaves the historical row intact.
  push_token_id     UUID REFERENCES public.user_push_tokens(id) ON DELETE SET NULL,
  delivery_status   TEXT NOT NULL DEFAULT 'pending'
                      CHECK (delivery_status IN ('pending', 'ok', 'error')),
  error_detail      TEXT
);

-- Dedup key: one delivery per user per title per type, forever.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_deliveries_dedup
  ON public.notification_deliveries (user_id, notification_type, tmdb_id, media_type);

-- Cap query: "how many did this user get in the last 24h?"
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_time
  ON public.notification_deliveries (user_id, sent_at DESC);

-- Receipt polling: find recently-sent tickets awaiting a receipt.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pending
  ON public.notification_deliveries (sent_at DESC)
  WHERE delivery_status = 'pending';

-- ── Row-level security ───────────────────────────────────────────────
-- Owner may read their own history (future in-app "notification centre");
-- only service_role writes. No user INSERT/UPDATE/DELETE.
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Users read own notification deliveries"
  ON public.notification_deliveries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "service_role_all_notification_deliveries" ON public.notification_deliveries;
CREATE POLICY "service_role_all_notification_deliveries"
  ON public.notification_deliveries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.notification_deliveries IS
  'Append-only sent-push ledger. UNIQUE(user,type,tmdb,media) = dedup; sent_at = daily cap window; expo_receipt_id = dead-token pruning (H0 Stream B, migration 057).';
