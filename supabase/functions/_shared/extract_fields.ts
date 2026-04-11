/**
 * Extract Enrichment Fields (Shared Module)
 *
 * Pure function that maps a TMDb detail response (movie or TV) to the
 * five Phase 0.5 enrichment fields stored on `titles`. No I/O, no
 * Supabase, no fetch — isomorphic TS that runs identically in Node.js
 * sync scripts and Deno Edge Functions.
 *
 * Imported by:
 *   - scripts/enrichment/backfill-enrichment.ts (Node.js one-time backfill)
 *   - supabase/functions/enrich-new-titles/index.ts (Deno Edge Function)
 *
 * The TMDb shapes this consumes are produced by:
 *   - GET /movie/{id}?append_to_response=keywords,credits,release_dates
 *   - GET /tv/{id}?append_to_response=keywords,credits,content_ratings
 *
 * Decisions (locked during Phase 0.5 planning):
 *   - Region fallback for content_rating: GB → US → NULL (no synthetic 'NR')
 *   - Keywords cap: none — store every keyword TMDb returns
 *   - Cast cap: top 5 by TMDb's billing order (the order field)
 *   - For TV, "director" comes from the top-level `created_by[]` array
 *     (the TMDb concept that maps to "showrunner/creator"). Crew is not
 *     consulted for TV.
 *   - For movies, "director" is the first crew member with job === 'Director'.
 *     Multiple directors are joined with ", ".
 *   - runtime: movies use top-level `runtime`, TV uses `episode_run_time[0]`.
 *     NULL if TMDb returns no value — never substitute a default.
 *
 * Empty array `[]` ≠ NULL: empty means "TMDb returned no values", NULL
 * is reserved for the "row has not been enriched yet" sentinel that the
 * work-queue query relies on.
 */

// ── Output type ─────────────────────────────────────────────────

export interface EnrichmentFields {
  keywords: string[];
  cast_top_5: string[];
  director: string | null;
  content_rating: string | null;
  runtime: number | null;
}

// ── TMDb response shapes (loose — only what we read) ────────────
//
// We type these as `unknown` at the boundary and narrow with helpers
// rather than declaring full TMDb interfaces. TMDb shapes drift over
// time and we only consume a tiny slice; narrow defensively per field
// so a missing branch produces NULL instead of throwing.

type TmdbResponse = Record<string, unknown>;
type MediaType = 'movie' | 'tv';

// ── Narrow helpers ──────────────────────────────────────────────

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asInteger(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v)
    ? v
    : null;
}

// ── Field extractors ────────────────────────────────────────────

function extractKeywords(response: TmdbResponse, mediaType: MediaType): string[] {
  const keywordsBlock = asObject(response.keywords);
  if (!keywordsBlock) return [];
  // Movies: { keywords: [{id, name}, ...] }
  // TV:     { results:  [{id, name}, ...] }
  const list = asArray(
    mediaType === 'movie' ? keywordsBlock.keywords : keywordsBlock.results
  );
  const out: string[] = [];
  for (const entry of list) {
    const obj = asObject(entry);
    if (!obj) continue;
    const name = asString(obj.name);
    if (name) out.push(name);
  }
  return out;
}

function extractCastTop5(response: TmdbResponse): string[] {
  const credits = asObject(response.credits);
  if (!credits) return [];
  const cast = asArray(credits.cast);
  // TMDb returns cast in billing order (the `order` field, ascending).
  // We trust that ordering — slicing the first 5 entries is correct
  // even when `order` is non-contiguous.
  const out: string[] = [];
  for (const entry of cast) {
    if (out.length === 5) break;
    const obj = asObject(entry);
    if (!obj) continue;
    const name = asString(obj.name);
    if (name) out.push(name);
  }
  return out;
}

function extractDirector(response: TmdbResponse, mediaType: MediaType): string | null {
  if (mediaType === 'tv') {
    // TV creators live at the top-level `created_by[]` field on the TV
    // detail response, NOT in credits.crew. A show can have multiple
    // creators (e.g. "Vince Gilligan" + "Peter Gould" for Better Call Saul).
    const creators = asArray(response.created_by);
    const names: string[] = [];
    for (const entry of creators) {
      const obj = asObject(entry);
      if (!obj) continue;
      const name = asString(obj.name);
      if (name) names.push(name);
    }
    return names.length > 0 ? names.join(', ') : null;
  }
  // Movies: first crew entries with job === 'Director'.
  const credits = asObject(response.credits);
  if (!credits) return null;
  const crew = asArray(credits.crew);
  const names: string[] = [];
  for (const entry of crew) {
    const obj = asObject(entry);
    if (!obj) continue;
    if (obj.job !== 'Director') continue;
    const name = asString(obj.name);
    if (name && !names.includes(name)) names.push(name);
  }
  return names.length > 0 ? names.join(', ') : null;
}

function pickCertificationFromMovieReleaseDates(
  releaseDatesEntry: Record<string, unknown>
): string | null {
  // Each per-country block has a `release_dates` array of entries with
  // shape `{certification, release_date, type, ...}`. There can be
  // multiple entries (theatrical, digital, physical re-release, etc.)
  // and certification may be an empty string. Return the first
  // non-empty certification we encounter.
  const inner = asArray(releaseDatesEntry.release_dates);
  for (const e of inner) {
    const obj = asObject(e);
    if (!obj) continue;
    const cert = asString(obj.certification);
    if (cert) return cert;
  }
  return null;
}

function extractContentRating(
  response: TmdbResponse,
  mediaType: MediaType
): string | null {
  if (mediaType === 'movie') {
    const releaseDates = asObject(response.release_dates);
    if (!releaseDates) return null;
    const results = asArray(releaseDates.results);
    // GB first, then US.
    let gb: Record<string, unknown> | null = null;
    let us: Record<string, unknown> | null = null;
    for (const entry of results) {
      const obj = asObject(entry);
      if (!obj) continue;
      const iso = asString(obj.iso_3166_1);
      if (iso === 'GB') gb = obj;
      else if (iso === 'US') us = obj;
    }
    if (gb) {
      const cert = pickCertificationFromMovieReleaseDates(gb);
      if (cert) return cert;
    }
    if (us) {
      const cert = pickCertificationFromMovieReleaseDates(us);
      if (cert) return cert;
    }
    return null;
  }
  // TV: `content_ratings.results[]` of `{iso_3166_1, rating}`. Simpler shape.
  const contentRatings = asObject(response.content_ratings);
  if (!contentRatings) return null;
  const results = asArray(contentRatings.results);
  let gb: string | null = null;
  let us: string | null = null;
  for (const entry of results) {
    const obj = asObject(entry);
    if (!obj) continue;
    const iso = asString(obj.iso_3166_1);
    const rating = asString(obj.rating);
    if (!rating) continue;
    if (iso === 'GB') gb = rating;
    else if (iso === 'US') us = rating;
  }
  return gb ?? us ?? null;
}

function extractRuntime(response: TmdbResponse, mediaType: MediaType): number | null {
  if (mediaType === 'movie') {
    return asInteger(response.runtime);
  }
  // TV: episode_run_time is an integer array; take the first value.
  // Newer shows often have an empty array because TMDb has deprecated
  // multi-value episode_run_time in favour of per-episode runtime on
  // /tv/{id}/season/{n}/episode/{n}. NULL is the right answer when empty.
  const arr = asArray(response.episode_run_time);
  for (const v of arr) {
    const n = asInteger(v);
    if (n != null && n > 0) return n;
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Extract the five Phase 0.5 enrichment fields from a TMDb detail
 * response. Pure function: same input always produces the same output.
 *
 * Throws only if `response` is null/undefined or `mediaType` is not
 * 'movie'/'tv'. All field-level missing data produces empty arrays
 * or NULL — never throws on shape drift inside the response.
 */
export function extractFields(
  response: unknown,
  mediaType: MediaType
): EnrichmentFields {
  if (response == null || typeof response !== 'object') {
    throw new Error('extractFields: response must be a non-null object');
  }
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    throw new Error(`extractFields: mediaType must be 'movie' or 'tv', got ${String(mediaType)}`);
  }
  const r = response as TmdbResponse;
  return {
    keywords: extractKeywords(r, mediaType),
    cast_top_5: extractCastTop5(r),
    director: extractDirector(r, mediaType),
    content_rating: extractContentRating(r, mediaType),
    runtime: extractRuntime(r, mediaType),
  };
}
