/**
 * Embedding Template (Shared Module)
 *
 * Pure function that builds the text input for OpenAI text-embedding-3-small
 * from a title's enriched metadata. No I/O, no Supabase, no fetch —
 * isomorphic TS that runs identically in Node.js scripts and Deno Edge
 * Functions.
 *
 * Implements the locked template from Strategy v1.6.3 §4.1 (lines 200-209),
 * confirmed verbatim in Parking Lot IN-104 (lines 382-389):
 *
 *   {title} ({release_year}) - {media_type}
 *   Genres: {genres}
 *   Overview: {overview}
 *   Keywords: {keywords}
 *   Cast: {cast}
 *   Runtime: {runtime} minutes
 *
 * Director is intentionally excluded per §4.1. The embedding evaluation that
 * selected text-embedding-3-small was run against this six-line template.
 *
 * Rules:
 *   - Empty lines are omitted (no "Keywords: " with nothing after)
 *   - Runtime line omitted if NULL or 0 (runtime: 0 treated as NULL per
 *     Phase 0.5 Deviation 2)
 *   - Trim to ~2000 characters max
 *   - Genres resolved from genre_ids via GENRE_NAMES; unknown IDs skipped
 *   - media_type displayed as "Movie" or "TV Series"
 *
 * Imported by:
 *   - scripts/embeddings/backfill-embeddings.ts (Node.js one-time backfill)
 *   - supabase/functions/embed-new-titles/index.ts (Deno Edge Function)
 */

import { GENRE_NAMES } from './genreNames.ts';

// ── Input type ──────────────────────────────────────────────────

export interface EmbeddingInput {
  title: string;
  release_year: number;
  media_type: 'movie' | 'tv';
  genre_ids: number[];
  overview: string | null;
  keywords: string[];
  cast_top_5: string[];
  runtime: number | null;
}

// ── Constants ───────────────────────────────────────────────────

const MAX_CHARS = 2000;

// ── Public API ──────────────────────────────────────────────────

/**
 * Build the embedding input text for a single title.
 *
 * Returns a string of up to MAX_CHARS characters, ready to be sent to the
 * OpenAI embeddings endpoint. Never returns an empty string — at minimum
 * the title/year/media_type header line is always present.
 */
export function buildEmbeddingText(input: EmbeddingInput): string {
  const mediaLabel = input.media_type === 'movie' ? 'Movie' : 'TV Series';
  const lines: string[] = [];

  // Line 1: always present
  lines.push(`${input.title} (${input.release_year}) - ${mediaLabel}`);

  // Line 2: Genres (skip unknown IDs silently)
  const genreNames = input.genre_ids
    .map((id) => GENRE_NAMES[id])
    .filter(Boolean);
  if (genreNames.length > 0) {
    lines.push(`Genres: ${genreNames.join(', ')}`);
  }

  // Line 3: Overview
  if (input.overview) {
    lines.push(`Overview: ${input.overview}`);
  }

  // Line 4: Keywords
  if (input.keywords.length > 0) {
    lines.push(`Keywords: ${input.keywords.join(', ')}`);
  }

  // Line 5: Cast
  if (input.cast_top_5.length > 0) {
    lines.push(`Cast: ${input.cast_top_5.join(', ')}`);
  }

  // Line 6: Runtime (omit if null or 0 — 0 is a TMDb placeholder)
  if (input.runtime && input.runtime > 0) {
    lines.push(`Runtime: ${input.runtime} minutes`);
  }

  const text = lines.join('\n');
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS);
}
