/**
 * Content Vector Mapping
 *
 * Maps TMDb content metadata to a TasteVector so we can compute
 * similarity between user preferences and content items.
 *
 * Content vectors use binary genre values (1.0 or 0.0).
 * Meta dimensions are derived from genre combinations + metadata signals.
 */

import {
  type TasteVector,
  type GenreDimension,
  createEmptyVector,
  clampVector,
} from './tasteVector';

// ── TMDb genre ID → vector dimension key ────────────────────────

const TMDB_GENRE_TO_DIM: Record<number, GenreDimension> = {
  28: 'action',
  12: 'adventure',
  16: 'animation',
  35: 'comedy',
  80: 'crime',
  99: 'documentary',
  18: 'drama',
  10751: 'family',
  14: 'fantasy',
  36: 'history',
  27: 'horror',
  10402: 'musical',
  9648: 'mystery',
  10749: 'romance',
  878: 'scifi',
  53: 'thriller',
  10752: 'war',
  37: 'western',
  // TV-specific genres that map to our dimensions
  10759: 'action',     // Action & Adventure → action
  10764: 'reality',
  10768: 'war',        // War & Politics → war
};

// ── Tone derivation (genre combos → dark/light score) ───────────

type GenreSet = Set<number>;

function deriveTone(genres: GenreSet): number {
  let tone = 0;
  let signals = 0;

  // Dark-leaning genres
  if (genres.has(27))  { tone -= 0.8; signals++; } // Horror
  if (genres.has(53))  { tone -= 0.5; signals++; } // Thriller
  if (genres.has(80))  { tone -= 0.4; signals++; } // Crime
  if (genres.has(10752)){ tone -= 0.5; signals++; } // War
  if (genres.has(18))  { tone -= 0.2; signals++; } // Drama (slightly dark)

  // Light-leaning genres
  if (genres.has(35))  { tone += 0.6; signals++; } // Comedy
  if (genres.has(10751)){ tone += 0.7; signals++; } // Family
  if (genres.has(16))  { tone += 0.3; signals++; } // Animation
  if (genres.has(10402)){ tone += 0.4; signals++; } // Musical
  if (genres.has(10749)){ tone += 0.3; signals++; } // Romance

  // Genre combos that override
  if (genres.has(28) && genres.has(35)) tone += 0.3; // Action+Comedy = lighter
  if (genres.has(27) && genres.has(53)) tone -= 0.3; // Horror+Thriller = darker
  if (genres.has(18) && genres.has(35)) tone += 0.2; // Dramedy = lighter than drama

  return signals > 0 ? Math.max(-1, Math.min(1, tone / Math.max(signals, 1))) : 0;
}

// ── Pacing derivation ───────────────────────────────────────────

function derivePacing(genres: GenreSet, runtime?: number | null): number {
  let pacing = 0;
  let signals = 0;

  // Fast-paced genres
  if (genres.has(28))  { pacing += 0.7; signals++; } // Action
  if (genres.has(53))  { pacing += 0.5; signals++; } // Thriller
  if (genres.has(27))  { pacing += 0.3; signals++; } // Horror
  if (genres.has(10759)){ pacing += 0.6; signals++; } // Action & Adventure (TV)

  // Slow-paced genres
  if (genres.has(18))  { pacing -= 0.4; signals++; } // Drama
  if (genres.has(99))  { pacing -= 0.5; signals++; } // Documentary
  if (genres.has(36))  { pacing -= 0.4; signals++; } // History
  if (genres.has(10749)){ pacing -= 0.2; signals++; } // Romance

  // Runtime as secondary signal (>150min = slower, <90min = faster)
  if (runtime) {
    if (runtime > 150) { pacing -= 0.2; signals++; }
    else if (runtime < 90) { pacing += 0.2; signals++; }
  }

  return signals > 0 ? Math.max(-1, Math.min(1, pacing / Math.max(signals, 1))) : 0;
}

// ── Era derivation ──────────────────────────────────────────────

function deriveEra(genres: GenreSet, releaseYear?: number | null): number {
  let era = 0;

  // Release year is the primary signal
  if (releaseYear) {
    if (releaseYear < 1980) era = -0.8;
    else if (releaseYear < 1990) era = -0.5;
    else if (releaseYear < 2000) era = -0.3;
    else if (releaseYear < 2010) era = 0.0;
    else if (releaseYear < 2015) era = 0.3;
    else if (releaseYear < 2020) era = 0.6;
    else era = 0.8;
  }

  // Period/history genres push toward classic regardless of release date
  if (genres.has(36)) era -= 0.3; // History
  if (genres.has(10752)) era -= 0.2; // War (often period settings)

  return Math.max(-1, Math.min(1, era));
}

// ── Popularity derivation ───────────────────────────────────────

function derivePopularity(
  tmdbPopularity?: number | null,
  voteCount?: number | null
): number {
  let pop = 0;

  // TMDb popularity score mapping
  // Top popular titles have popularity > 100, niche titles < 10
  if (tmdbPopularity != null) {
    if (tmdbPopularity > 100) pop = 0.9;
    else if (tmdbPopularity > 50) pop = 0.6;
    else if (tmdbPopularity > 20) pop = 0.3;
    else if (tmdbPopularity > 10) pop = 0.0;
    else if (tmdbPopularity > 5) pop = -0.3;
    else pop = -0.6;
  }

  // Vote count as secondary signal (< 500 = indie leaning)
  if (voteCount != null) {
    if (voteCount < 100) pop -= 0.3;
    else if (voteCount < 500) pop -= 0.1;
    else if (voteCount > 5000) pop += 0.2;
  }

  return Math.max(-1, Math.min(1, pop));
}

// ── Intensity derivation ────────────────────────────────────────

function deriveIntensity(genres: GenreSet): number {
  let intensity = 0;
  let signals = 0;

  // High intensity
  if (genres.has(27))  { intensity += 0.8; signals++; } // Horror
  if (genres.has(53))  { intensity += 0.6; signals++; } // Thriller
  if (genres.has(28))  { intensity += 0.5; signals++; } // Action
  if (genres.has(10752)){ intensity += 0.6; signals++; } // War

  // Low intensity
  if (genres.has(35))  { intensity -= 0.4; signals++; } // Comedy
  if (genres.has(10749)){ intensity -= 0.3; signals++; } // Romance
  if (genres.has(10751)){ intensity -= 0.5; signals++; } // Family
  if (genres.has(99))  { intensity -= 0.2; signals++; } // Documentary

  // Combos
  if (genres.has(27) && genres.has(53)) intensity += 0.3; // Horror+Thriller = very intense
  if (genres.has(10749) && genres.has(35)) intensity -= 0.2; // Romcom = mellow

  return signals > 0 ? Math.max(-1, Math.min(1, intensity / Math.max(signals, 1))) : 0;
}

// ── Content metadata input type ─────────────────────────────────

export interface ContentMetadata {
  genreIds: number[];
  popularity?: number | null;
  voteCount?: number | null;
  releaseYear?: number | null;
  originalLanguage?: string | null;
  runtime?: number | null;
}

// ── In-memory cache ─────────────────────────────────────────────

const vectorCache = new Map<string, TasteVector>();
const MAX_CACHE_SIZE = 500;

function getCacheKey(meta: ContentMetadata): string {
  return `${meta.genreIds.sort().join(',')}_${meta.popularity ?? ''}_${meta.voteCount ?? ''}_${meta.releaseYear ?? ''}_${meta.originalLanguage ?? ''}`;
}

export function clearContentVectorCache() {
  vectorCache.clear();
}

// ── Main mapping function ───────────────────────────────────────

/**
 * Map TMDb content metadata to a TasteVector.
 * Content vectors use binary genre values (1.0 or 0.0).
 * Meta dimensions derived from genre combos + metadata.
 */
export function contentToVector(meta: ContentMetadata): TasteVector {
  const key = getCacheKey(meta);
  const cached = vectorCache.get(key);
  if (cached) return cached;

  const v = createEmptyVector();
  const genreSet = new Set(meta.genreIds);

  // ─ Genre dimensions: binary 1.0/0.0 ─
  for (const genreId of meta.genreIds) {
    const dim = TMDB_GENRE_TO_DIM[genreId];
    if (dim) v[dim] = 1.0;
  }

  // ─ Anime detection: Japanese + Animation genre ─
  if (
    meta.originalLanguage === 'ja' &&
    genreSet.has(16) // Animation
  ) {
    v.anime = 1.0;
    v.animation = 1.0;
  }

  // ─ Meta dimensions ─
  v.tone = deriveTone(genreSet);
  v.pacing = derivePacing(genreSet, meta.runtime);
  v.era = deriveEra(genreSet, meta.releaseYear);
  v.popularity = derivePopularity(meta.popularity, meta.voteCount);
  v.intensity = deriveIntensity(genreSet);

  const result = clampVector(v);

  // Cache with eviction
  if (vectorCache.size >= MAX_CACHE_SIZE) {
    const firstKey = vectorCache.keys().next().value;
    if (firstKey !== undefined) vectorCache.delete(firstKey);
  }
  vectorCache.set(key, result);

  return result;
}
