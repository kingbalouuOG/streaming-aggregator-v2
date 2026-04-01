-- User interaction events (immutable event log)
-- Captures every behavioural signal as a timestamped event.
-- The taste vector in taste_profiles remains the derived projection;
-- this table is the source of truth for raw signals.

CREATE TABLE user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  content_id INTEGER,         -- TMDb ID (nullable for non-content events e.g. quiz_answer, search)
  media_type TEXT,            -- 'movie' | 'tv' (nullable for non-content events)
  metadata JSONB DEFAULT '{}', -- flexible payload per event type
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: users can only read/write their own events
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own interactions"
  ON user_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own interactions"
  ON user_interactions FOR SELECT
  USING (auth.uid() = user_id);

-- No UPDATE or DELETE policies: events are immutable.
-- The only deletion path is CASCADE from profiles (account deletion).

-- Indexes for common query patterns
CREATE INDEX idx_interactions_user_created
  ON user_interactions(user_id, created_at DESC);

CREATE INDEX idx_interactions_user_type
  ON user_interactions(user_id, event_type);

CREATE INDEX idx_interactions_content
  ON user_interactions(user_id, content_id, media_type);
