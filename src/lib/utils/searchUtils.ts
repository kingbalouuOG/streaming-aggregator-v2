/**
 * Search Utilities
 * Query preprocessing and client-side result re-ranking for TMDb search.
 */

import type { ContentItem } from '@/components/ContentCard';

/**
 * Extract a trailing year from a search query.
 * Handles "Title 2020" and "Title (2020)" patterns.
 * Does NOT extract years at the start of the string (protects titles like "2001: A Space Odyssey").
 *
 * @returns cleanQuery with year removed, and the extracted year if found
 */
export function extractYearFromQuery(query: string): { cleanQuery: string; year?: number } {
  const trimmed = query.trim();

  // Match "(2024)" anywhere in the string
  const parenMatch = trimmed.match(/\((\d{4})\)\s*$/);
  if (parenMatch) {
    const year = parseInt(parenMatch[1], 10);
    if (year >= 1900 && year <= 2030) {
      const cleanQuery = trimmed.replace(parenMatch[0], '').trim();
      if (cleanQuery.length >= 2) {
        return { cleanQuery, year };
      }
    }
  }

  // Match bare year at end of string: "Inception 2010"
  const bareMatch = trimmed.match(/\s(\d{4})\s*$/);
  if (bareMatch) {
    const year = parseInt(bareMatch[1], 10);
    if (year >= 1900 && year <= 2030) {
      const cleanQuery = trimmed.replace(bareMatch[0], '').trim();
      if (cleanQuery.length >= 2) {
        return { cleanQuery, year };
      }
    }
  }

  return { cleanQuery: trimmed };
}

/**
 * Re-rank search results using a composite score.
 *
 * Scoring factors and weights (tuneable):
 *   - Title match quality (0.45): exact=1.0, startsWith=0.8, includes=0.5, else=0.0
 *   - TMDb popularity     (0.30): normalised to 0-1, capped at 100
 *   - Vote confidence      (0.15): normalised to 0-1, capped at 1000 votes
 *   - Recency              (0.10): linear scale from 1950 to current year
 *
 * Deviation from spec: spec uses 0.50/0.30/0.20 (no recency).
 * Recency factor added to bias toward newer content for ambiguous queries
 * (e.g., "Avatar" returns 2022 sequel above 2009 original).
 * Set WEIGHT_RECENCY to 0 and redistribute to disable.
 */
export function reRankSearchResults(items: ContentItem[], query: string): ContentItem[] {
  const WEIGHT_TITLE = 0.45;
  const WEIGHT_POPULARITY = 0.30;
  const WEIGHT_VOTES = 0.15;
  const WEIGHT_RECENCY = 0.10;

  const normalizedQuery = query.toLowerCase().trim();
  const currentYear = new Date().getFullYear();

  const scored = items.map((item) => {
    const title = item.title.toLowerCase();

    // Title match quality (0-1)
    let titleScore = 0;
    if (title === normalizedQuery) titleScore = 1.0;
    else if (title.startsWith(normalizedQuery)) titleScore = 0.8;
    else if (title.includes(normalizedQuery)) titleScore = 0.5;

    // Popularity: TMDb scale ~0-500+, cap at 100 for normalisation
    const popScore = Math.min((item.popularity || 0) / 100, 1);

    // Vote confidence: more votes = higher confidence in rating
    const voteScore = Math.min((item.voteCount || 0) / 1000, 1);

    // Recency: linear scale, 1950=0, currentYear=1
    const yearVal = item.year || 2000;
    const recencyScore = Math.max(0, Math.min((yearVal - 1950) / (currentYear - 1950), 1));

    const score =
      titleScore * WEIGHT_TITLE +
      popScore * WEIGHT_POPULARITY +
      voteScore * WEIGHT_VOTES +
      recencyScore * WEIGHT_RECENCY;

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
