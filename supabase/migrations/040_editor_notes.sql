-- ============================================
-- Phase 6 — editor_notes table (v3 redesign)
-- Migration 040
-- ============================================
--
-- Backs the EditorsNote primitive on Home / For You §5.2. One row =
-- one editorial note: kicker (taxonomic label), body (essay), with a
-- publish window for scheduled drops.
--
-- Read-side pattern: useHomeContent fetches the most recent currently-
-- published note per request. Cached once per day on the client; row
-- count in production is tiny (< ~100 across the app's lifetime), so
-- a full table scan with a single ORDER BY is fine.
-- ============================================

CREATE TABLE IF NOT EXISTS public.editor_notes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kicker        text        NOT NULL,
  body          text        NOT NULL,
  -- The single sentence used as the collapsed-strip teaser. If
  -- omitted, the read-side falls back to the first sentence of body.
  teaser        text        NULL,
  published_at  timestamptz NOT NULL DEFAULT now(),
  -- Optional expiry. NULL = no expiry; otherwise the read query
  -- ignores the row after expires_at.
  expires_at    timestamptz NULL,

  -- Bookkeeping
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Plain btree on the publish column serving the read query's
-- ORDER BY published_at DESC LIMIT 1. NOTE: an earlier version of this
-- migration used a partial predicate `WHERE expires_at IS NULL OR
-- expires_at > now()`, but now() is not IMMUTABLE and cannot appear in an
-- index predicate (Postgres 42P17) — that error is why 040 never applied
-- to prod until H0 Stream A. Row count is tiny (< ~100 lifetime), so a
-- plain index is more than enough.
CREATE INDEX IF NOT EXISTS editor_notes_published_at_idx
  ON public.editor_notes (published_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────
-- Public-readable; only service_role writes (editorial team uses the
-- Supabase studio or a small admin script). The "authenticated" role
-- gets the same SELECT policy as anon to match the Phase 0
-- cache-table pattern that bit us in 005.
ALTER TABLE public.editor_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY editor_notes_select_anon
  ON public.editor_notes
  FOR SELECT
  TO anon
  USING (
    published_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
  );

CREATE POLICY editor_notes_select_authenticated
  ON public.editor_notes
  FOR SELECT
  TO authenticated
  USING (
    published_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
  );

CREATE POLICY editor_notes_all_service_role
  ON public.editor_notes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Seed row ──────────────────────────────────────────────────────
-- One sample note so Home / For You has copy on first load. Editorial
-- can replace via Supabase studio.
INSERT INTO public.editor_notes (kicker, teaser, body, published_at)
VALUES (
  'EDITOR''S NOTE',
  'A great prestige drama, three sci-fi misses, and the case for taking notes during the credits.',
  E'A great prestige drama is rare in any year, and this week we have one. Three and a half hours of patient cinema that earns every minute — and a reminder that the streaming services still know how to platform serious work when they want to.\n\nElsewhere the sci-fi shelf is thin. Two of the three new high-concept releases stumble in the second act, and the third never finds a tone. Worth waiting on.\n\nThe case for credits: keep watching after the cut. The best gags this season are tucked into the typography.',
  now()
)
ON CONFLICT DO NOTHING;
