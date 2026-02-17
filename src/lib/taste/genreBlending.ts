/**
 * Genre Blending Utilities
 *
 * Scoring and reordering functions for homepage sections.
 * Uses the canonical TMDB_GENRE_TO_DIM mapping — no duplicate tables.
 */

import type { TasteVector, GenreDimension } from './tasteVector';
import { TMDB_GENRE_TO_DIM } from './contentVectorMapping';

// ── matchScore ──────────────────────────────────────────────────
//
// Fast dot product: sums the user's vector score for each of the
// title's genres.  NOT normalized — multi-genre titles intentionally
// score higher (e.g. rom-com = comedy + romance > pure comedy).

export function matchScore(
  titleGenreIds: number[],
  userVector: TasteVector,
): number {
  if (titleGenreIds.length === 0) return 0;

  let score = 0;
  const counted = new Set<string>();

  for (const genreId of titleGenreIds) {
    const dim = TMDB_GENRE_TO_DIM[genreId];
    if (dim && !counted.has(dim)) {
      score += userVector[dim];
      counted.add(dim);
    }
  }

  // Compound TV genres: add the second dimension that the lookup misses
  const genreSet = new Set(titleGenreIds);
  if (genreSet.has(10765) && !counted.has('fantasy')) {
    score += userVector.fantasy;
    counted.add('fantasy');
  }
  if (genreSet.has(10759) && !counted.has('adventure')) {
    score += userVector.adventure;
    counted.add('adventure');
  }

  return score;
}

// ── reorderWithinWindows ────────────────────────────────────────
//
// Preserves the primary API sort (recency, rating, popularity) at
// the macro level while nudging genre-matched items upward within
// fixed-size windows.  Items never cross window boundaries.

export function reorderWithinWindows<T>(
  items: T[],
  userVector: TasteVector,
  getGenreIds: (item: T) => number[],
  windowSize = 5,
): T[] {
  const result: T[] = [];
  for (let i = 0; i < items.length; i += windowSize) {
    const window = items.slice(i, i + windowSize);
    window.sort(
      (a, b) =>
        matchScore(getGenreIds(b), userVector) -
        matchScore(getGenreIds(a), userVector),
    );
    result.push(...window);
  }
  return result;
}

// ── generateGenreCombinations ───────────────────────────────────
//
// Returns pairwise TMDb genre ID combinations for AND discover queries.
// Caller is responsible for mapping vector keys → movie IDs via
// GENRE_KEY_TO_TMDB before calling, and converting to TV IDs after.

export function generateGenreCombinations(
  topGenres: { genreId: number; score: number }[],
  minScore = 0.3,
): number[][] {
  const eligible = topGenres
    .filter((g) => g.score >= minScore)
    .slice(0, 5);

  const combos: number[][] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      combos.push([eligible[i].genreId, eligible[j].genreId]);
    }
  }
  return combos;
}

// ── hybridScore ─────────────────────────────────────────────────
//
// For genre sections: matchScore as primary signal with tiny
// popularity and rating tiebreakers.

export interface ScoringFields {
  _genreIds?: number[];
  _popularity?: number;
  rating?: number;
}

export function hybridScore(
  item: ScoringFields,
  userVector: TasteVector,
): number {
  const genreScore = matchScore(item._genreIds || [], userVector);
  const popularityBonus = Math.min((item._popularity || 0) / 100, 1) * 0.1;
  const ratingBonus =
    (item.rating || 0) >= 7 ? ((item.rating! - 7) * 0.03) : 0;
  return genreScore + popularityBonus + ratingBonus;
}
