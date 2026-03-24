-- ============================================
-- Fix: Add read access for authenticated users
-- The original migration only granted SELECT to anon,
-- but signed-in users use the authenticated role.
-- Without this, authenticated users get empty results
-- from all content cache tables.
-- ============================================

CREATE POLICY IF NOT EXISTS "authenticated_read_streaming" ON streaming_availability
  FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "authenticated_read_titles" ON titles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "authenticated_read_genres" ON title_genres
  FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "authenticated_read_credits" ON title_credits
  FOR SELECT TO authenticated USING (true);
