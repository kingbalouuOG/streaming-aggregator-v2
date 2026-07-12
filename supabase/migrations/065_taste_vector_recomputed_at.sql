-- Migration 065: taste_profiles.taste_vector_recomputed_at
--
-- Pre-launch performance batch (2026-07-12) — nightly stale-recompute
-- activity gate. See src/lib/server/staleRecompute.ts.
--
-- Problem: the W5 nightly cron selected stale profiles by
-- taste_vector_updated_at < now-24h and full-replayed each one. But
-- taste_vector_updated_at bumps on BOTH the client's per-interaction EMA
-- write AND the cron's own recompute — so it cannot distinguish "the
-- vector was last touched by an interaction" from "…by a recompute". The
-- practical effect: dormant users (no new interactions) get a full
-- event-log replay + k-means every ~2 nights forever, consuming the
-- MAX_PROFILES_PER_RUN budget that genuinely-active-returning users need.
--
-- Fix: a dedicated recompute marker, distinct from updated_at. The cron
-- selects on recomputed_at (NULL = never recomputed → always eligible),
-- and skips the expensive replay for any user with no taste-relevant
-- interaction newer than their last recompute — stamping recomputed_at
-- either way so the row leaves the 24h scan window. Decay for a dormant
-- user is applied lazily on their next real interaction, not eagerly
-- every night (the client EMA already gives immediate responsiveness).
--
-- NULL default: every existing row is treated as "never recomputed" and
-- picked up over the first few nightly runs (bounded by
-- MAX_PROFILES_PER_RUN), which self-heals with no backfill.

ALTER TABLE public.taste_profiles
  ADD COLUMN IF NOT EXISTS taste_vector_recomputed_at TIMESTAMPTZ;

-- The nightly scan filters `taste_vector_recomputed_at IS NULL OR
-- < cutoff` ordered ascending nulls-first, over rows that have a vector.
-- Partial index keeps that scan off a full-table sort as the profile
-- count grows.
CREATE INDEX IF NOT EXISTS idx_taste_profiles_recompute_scan
  ON public.taste_profiles (taste_vector_recomputed_at ASC NULLS FIRST)
  WHERE taste_vector_v2 IS NOT NULL;

COMMENT ON COLUMN public.taste_profiles.taste_vector_recomputed_at IS
  'Last time the nightly W5 cron ran (or intentionally skipped) a full '
  'recompute for this profile. Distinct from taste_vector_updated_at, '
  'which also bumps on client EMA writes. Gates the recompute activity '
  'filter in src/lib/server/staleRecompute.ts.';
