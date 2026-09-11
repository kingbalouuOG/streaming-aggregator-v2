-- 083 — vendor show id → TMDb id map for the incremental sync (IN-SY-001)
--
-- The Streaming Availability `/changes` feed identifies a title ONLY by
-- Movie of the Night's own `showId`. It carries no TMDb id at all (the
-- payload keys are changeType, itemType, link, service, showId, showType,
-- streamingOptionType, timestamp). `sync-incremental` has been storing
-- that vendor id in `streaming_availability.tmdb_id` since b29bdf1
-- (2026-04-01): 58,718 rows, 27,644 of which collide with a real but
-- unrelated title and render on cards with a link to different content.
--
-- Resolving every change through `/shows/{showId}` would cost ~33,000
-- requests/month against a 25,000 quota. This table is the cheap path:
-- `/shows/search/filters` returns BOTH the vendor id and the real tmdbId
-- for every catalogue entry, 20 per request, so a catalogue walk
-- (scripts/sync/backfill-service-catalogue.ts) fills the map almost for
-- free, and the daily `/changes` walk resolves against it at zero request
-- cost. Only an id the map has never seen costs a single `/shows/{id}`
-- lookup, and that lookup writes its answer back here.
--
-- `sa_show_id` is text, not integer: the vendor documents it as an opaque
-- string ("6", "22007718"). Storing it as an integer is exactly the
-- mistake this table exists to undo.
--
-- Reversibility: DROP TABLE public.sa_show_map; — the sync then treats
-- every change as unresolvable and skips it (it never falls back to the
-- vendor id), so dropping the table stops writes rather than corrupting.

CREATE TABLE IF NOT EXISTS public.sa_show_map (
  sa_show_id    text        PRIMARY KEY,
  tmdb_id       integer     NOT NULL,
  media_type    text        NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title         text,
  -- 'catalogue-walk' (backfill-service-catalogue.ts) or 'changes-lookup'
  -- (sync-incremental's per-miss /shows/{id} fallback).
  source        text        NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

-- Reverse lookups ("which vendor id is this title?") for the cleanup
-- queries and for any future repair of streaming_history.
CREATE INDEX IF NOT EXISTS idx_sa_show_map_tmdb
  ON public.sa_show_map (tmdb_id, media_type);

COMMENT ON TABLE public.sa_show_map IS
  'Movie of the Night show id -> TMDb (tmdb_id, media_type). Seeded by '
  'catalogue walks, consulted by sync-incremental to resolve /changes '
  'rows, which carry no TMDb id. Migration 083 (IN-SY-001).';

-- Service-role only, same pattern as backfill_skips (063): RLS on with no
-- policies, so anon/authenticated see nothing and service_role bypasses.
ALTER TABLE public.sa_show_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sa_show_map FROM anon, authenticated;
