/**
 * Genre Names (Shared Module)
 *
 * TMDb genre ID → human-readable display name mapping. Used by the
 * embedding template to resolve `titles.genre_ids` into text for the
 * embedding input string.
 *
 * Source of truth: src/lib/constants/genres.ts — keep in sync.
 *
 * Imported by:
 *   - supabase/functions/_shared/embeddingTemplate.ts
 *
 * This file exists as a separate _shared/ module because Deno Edge
 * Functions cannot import from src/lib/. The extract_fields.ts pattern
 * (co-located pure data + logic) is the precedent.
 */

export const GENRE_NAMES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Musical',
  9648: 'Mystery',
  10764: 'Reality',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  // TV-specific
  10759: 'Action & Adventure',
  10763: 'News',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};
