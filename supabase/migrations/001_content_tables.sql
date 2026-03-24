-- ============================================
-- Videx Content Cache Schema
-- Phase B1.1: Content tables for SA API + TMDb data
-- ============================================

-- ── Content titles (core metadata from TMDb) ─────────────

CREATE TABLE IF NOT EXISTS titles (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  original_title TEXT,
  overview TEXT,
  release_date DATE,
  release_year INTEGER,
  poster_path TEXT,
  backdrop_path TEXT,
  genre_ids INTEGER[],
  vote_average NUMERIC(3,1),
  vote_count INTEGER,
  popularity NUMERIC(10,3),
  original_language TEXT,
  runtime INTEGER,              -- minutes, movies only
  number_of_seasons INTEGER,    -- TV only
  status TEXT,                  -- "Released", "Returning Series", etc.

  -- External IDs
  imdb_id TEXT,

  -- Ratings from OMDB
  rt_score TEXT,                -- Rotten Tomatoes percentage (e.g. "93%")
  imdb_rating NUMERIC(3,1),

  -- Sync metadata
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tmdb_id, media_type)
);

CREATE INDEX IF NOT EXISTS idx_titles_tmdb ON titles (tmdb_id, media_type);
CREATE INDEX IF NOT EXISTS idx_titles_imdb ON titles (imdb_id);
CREATE INDEX IF NOT EXISTS idx_titles_popularity ON titles (popularity DESC);
CREATE INDEX IF NOT EXISTS idx_titles_release ON titles (release_date DESC);


-- ── Streaming availability (from SA API) ─────────────────

CREATE TABLE IF NOT EXISTS streaming_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  service_id TEXT NOT NULL,       -- Videx service ID (e.g. 'netflix', 'bbc')
  sa_service_id TEXT NOT NULL,    -- SA API slug (e.g. 'netflix', 'iplayer')
  stream_type TEXT NOT NULL CHECK (stream_type IN ('subscription', 'rent', 'buy', 'free', 'addon')),

  -- Deep link URLs
  deep_link_url TEXT NOT NULL,
  video_link_url TEXT,            -- Direct video player link (if available)

  -- Quality and features
  quality TEXT,                   -- 'sd', 'hd', 'uhd'

  -- Pricing (rent/buy only)
  price_amount NUMERIC(8,2),
  price_currency TEXT,            -- ISO 4217 (e.g. 'GBP')
  price_formatted TEXT,           -- Display-ready (e.g. '£3.49')

  -- Addon info (if stream_type = 'addon')
  addon_id TEXT,
  addon_name TEXT,

  -- Expiry
  expires_soon BOOLEAN DEFAULT FALSE,
  expires_on TIMESTAMPTZ,

  -- Sync metadata
  available_since TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tmdb_id, media_type, service_id, stream_type, quality)
);

CREATE INDEX IF NOT EXISTS idx_sa_lookup ON streaming_availability (tmdb_id, media_type);
CREATE INDEX IF NOT EXISTS idx_sa_service ON streaming_availability (service_id);
CREATE INDEX IF NOT EXISTS idx_sa_stale ON streaming_availability (last_verified_at ASC);
CREATE INDEX IF NOT EXISTS idx_sa_expiring ON streaming_availability (expires_soon) WHERE expires_soon = TRUE;


-- ── Genre mapping ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS title_genres (
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  genre_id INTEGER NOT NULL,
  genre_name TEXT NOT NULL,
  PRIMARY KEY (tmdb_id, media_type, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_genres_genre ON title_genres (genre_id);


-- ── Cast and crew ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS title_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  person_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('cast', 'director')),
  character_name TEXT,            -- For cast only
  display_order INTEGER,

  UNIQUE (tmdb_id, media_type, person_name, role)
);

CREATE INDEX IF NOT EXISTS idx_credits_title ON title_credits (tmdb_id, media_type);


-- ── Sync log ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'incremental', 'changes')),
  source TEXT NOT NULL,           -- 'tmdb', 'sa_api', 'omdb', 'all'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  titles_processed INTEGER DEFAULT 0,
  titles_added INTEGER DEFAULT 0,
  titles_updated INTEGER DEFAULT 0,
  titles_removed INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  error_details JSONB,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);


-- ── Row Level Security ───────────────────────────────────
-- anon can SELECT (app reads). INSERT/UPDATE/DELETE restricted to service_role (Edge Functions).

ALTER TABLE titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Read access for anon (app)
CREATE POLICY "anon_read_titles" ON titles FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_streaming" ON streaming_availability FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_genres" ON title_genres FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_credits" ON title_credits FOR SELECT TO anon USING (true);

-- Full access for service_role (Edge Functions)
CREATE POLICY "service_role_titles" ON titles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_streaming" ON streaming_availability FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_genres" ON title_genres FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_credits" ON title_credits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_sync_log" ON sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── TTL functions for stale data identification ──────────

-- Titles needing metadata refresh (older than 7 days)
CREATE OR REPLACE FUNCTION get_stale_titles(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (tmdb_id INTEGER, media_type TEXT, imdb_id TEXT) AS $$
  SELECT tmdb_id, media_type, imdb_id
  FROM titles
  WHERE last_synced_at < NOW() - INTERVAL '7 days'
  ORDER BY last_synced_at ASC
  LIMIT limit_count;
$$ LANGUAGE sql;

-- Titles needing availability refresh (older than 24 hours)
CREATE OR REPLACE FUNCTION get_stale_availability(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (tmdb_id INTEGER, media_type TEXT, imdb_id TEXT) AS $$
  SELECT t.tmdb_id, t.media_type, t.imdb_id
  FROM titles t
  LEFT JOIN streaming_availability sa ON t.tmdb_id = sa.tmdb_id AND t.media_type = sa.media_type
  GROUP BY t.tmdb_id, t.media_type, t.imdb_id
  HAVING MIN(sa.last_verified_at) < NOW() - INTERVAL '24 hours'
     OR MIN(sa.last_verified_at) IS NULL
  ORDER BY MIN(sa.last_verified_at) ASC NULLS FIRST
  LIMIT limit_count;
$$ LANGUAGE sql;

-- Titles needing OMDB ratings (older than 30 days or missing)
CREATE OR REPLACE FUNCTION get_stale_ratings(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (tmdb_id INTEGER, media_type TEXT, imdb_id TEXT) AS $$
  SELECT tmdb_id, media_type, imdb_id
  FROM titles
  WHERE imdb_id IS NOT NULL
    AND (rt_score IS NULL OR last_synced_at < NOW() - INTERVAL '30 days')
  ORDER BY last_synced_at ASC
  LIMIT limit_count;
$$ LANGUAGE sql;
