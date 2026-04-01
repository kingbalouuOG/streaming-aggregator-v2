-- C1.5: Append-only log of streaming availability changes
-- Enables "leaving soon" alerts, "recently added" accuracy, and data quality auditing.
-- Never update or delete rows — this is a log, not a state table.

CREATE TABLE streaming_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  service_id TEXT NOT NULL,           -- Videx service ID (e.g. 'channel4', not 'all4')
  event_type TEXT NOT NULL,           -- 'added' | 'removed' | 'updated' | 'price_changed'
  stream_type TEXT,
  quality TEXT,
  link TEXT,                          -- deep_link_url at time of event
  price_amount NUMERIC(8,2),
  price_currency TEXT,
  old_price_amount NUMERIC(8,2),      -- previous price, populated for 'price_changed' only
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_run_id TEXT                    -- sync_log.id (UUID stored as text) for traceability
);

-- Primary: "what changed for this service recently?"
CREATE INDEX idx_streaming_history_service_time
  ON streaming_history (service_id, recorded_at DESC);

-- Secondary: "what happened to this title?"
CREATE INDEX idx_streaming_history_title
  ON streaming_history (tmdb_id, media_type, recorded_at DESC);

-- Tertiary: "show me all removals in the last 7 days" (for leaving soon)
CREATE INDEX idx_streaming_history_event_time
  ON streaming_history (event_type, recorded_at DESC);

-- RLS: same pattern as all other content tables
ALTER TABLE streaming_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_history" ON streaming_history
  FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_read_history" ON streaming_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_all_history" ON streaming_history
  FOR ALL TO service_role USING (true);
