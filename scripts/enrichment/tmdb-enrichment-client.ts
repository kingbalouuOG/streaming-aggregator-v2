/**
 * Thin TMDb client for the Phase 0.5 enrichment backfill.
 *
 * Single responsibility: fetch a movie or TV detail response with the
 * `append_to_response` set the enrichment pipeline needs. Returns the
 * raw parsed JSON; transformation is the caller's job (via extractFields).
 *
 * Rate-limit + retry behaviour matches scripts/sync-content.ts:
 *   - 260 ms minimum interval between requests (TMDb_DELAY)
 *   - Exponential backoff on 429 / 5xx (max 3 retries)
 *   - 404 returned as `null` so the caller can mark the title as skipped
 *     without throwing (TMDb may have deleted the title since the row
 *     was synced)
 */

const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_DELAY = 260; // ms — matches sync-content.ts:98

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rateLimitedFetch(
  url: string,
  delayMs: number,
  maxRetries = 3
): Promise<Response> {
  await delay(delayMs);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return res;
      if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 2) * 1000; // 4s, 8s, 16s
        console.log(`  retry ${attempt + 1}/${maxRetries} after ${backoff}ms (HTTP ${res.status})`);
        await delay(backoff);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  retry ${attempt + 1}/${maxRetries} after ${backoff}ms (${err instanceof Error ? err.message : 'network error'})`);
        await delay(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Max retries exceeded: ${url}`);
}

/**
 * Fetch the enrichment payload for a single TMDb title. Returns the
 * parsed JSON response, or `null` if TMDb returned 404 (title deleted
 * upstream — caller should mark as skipped, not failed).
 *
 * Movies: keywords + credits + release_dates
 * TV:     keywords + credits + content_ratings
 *
 * Note: `episode_run_time` (TV) and `runtime` (movies) are top-level
 * fields on the detail response — no append needed.
 *
 * Note: TV creators come from the top-level `created_by[]` field, not
 * from `credits.crew[]` — also no append needed.
 */
export async function fetchEnrichmentFields(
  apiKey: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<unknown | null> {
  const append =
    mediaType === 'movie'
      ? 'keywords,credits,release_dates'
      : 'keywords,credits,content_ratings';
  const url = new URL(`${TMDB_BASE}/${mediaType}/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('append_to_response', append);
  const res = await rateLimitedFetch(url.toString(), TMDB_DELAY);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`TMDb ${res.status} ${res.statusText} for ${mediaType}/${tmdbId}`);
  }
  return res.json();
}
