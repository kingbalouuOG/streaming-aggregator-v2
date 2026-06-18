-- In-app feedback (native feedback loop).
-- A lightweight channel for deliberate, written-by-the-user product
-- feedback plus an optional 1–5 rating. Distinct from user_interactions
-- (the behavioural-signal event log) — this is commentary the user chose
-- to write, surfaced either from Profile → Send feedback or a one-time
-- timed prompt after ~5 min of cumulative use.

CREATE TABLE app_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  context JSONB DEFAULT '{}',   -- { surface, platform, ... } triage hints
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: users submit and read their own feedback; no UPDATE/DELETE (immutable,
-- like user_interactions). Deletion only via CASCADE on account removal.
-- service_role (server/admin) bypasses RLS for triage reads.
ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedback"
  ON app_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own feedback"
  ON app_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_app_feedback_user_created
  ON app_feedback(user_id, created_at DESC);
