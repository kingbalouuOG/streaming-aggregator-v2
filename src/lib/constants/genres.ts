// TMDb Genre IDs
export const GENRES: Record<string, number> = {
  // Movies & TV (20 taste-vector genres)
  action: 28,
  adventure: 12,
  animation: 16,
  anime: -1,           // Videx-defined (no TMDb ID — detected via language + genre heuristic)
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  musical: 10402,
  mystery: 9648,
  reality: 10764,
  romance: 10749,
  sciFi: 878,
  thriller: 53,
  war: 10752,
  western: 37,

  // TV-specific (not in taste vector)
  actionAdventure: 10759,
  news: 10763,
  soap: 10766,
  talk: 10767,
  warPolitics: 10768,
};

// Genre display names
export const GENRE_NAMES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  [-1]: 'Anime',
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

// Reverse mapping: display name → TMDb genre ID
export const GENRE_NAME_TO_ID: Record<string, number> = {
  ...Object.fromEntries(
    Object.entries(GENRE_NAMES).map(([id, name]) => [name, Number(id)])
  ),
  // Backwards compatibility: "Music" still maps to 10402
  'Music': 10402,
};

// The 20 taste-vector genre IDs (for iteration in homepage ordering, etc.)
export const TASTE_GENRE_IDS = [
  28, 12, 16, -1, 35, 80, 99, 18, 10751, 14,
  36, 27, 10402, 9648, 10764, 10749, 878, 53, 10752, 37,
] as const;

export const getGenreName = (id: number): string => {
  return GENRE_NAMES[id] || 'Unknown';
};

// Taste vector dimension key → TMDb genre ID (shared mapping for homepage sections)
import { genreNameToKey } from '@/lib/taste/tasteVector';

export const GENRE_KEY_TO_TMDB: Record<string, number> = {};
for (const [name, id] of Object.entries(GENRE_NAME_TO_ID)) {
  const key = genreNameToKey(name);
  if (key && id > 0) GENRE_KEY_TO_TMDB[key] = id;
}

// ── TV Genre Compatibility ──────────────────────────────────────

// Genre IDs valid for the TMDb TV discover endpoint
export const VALID_TV_GENRE_IDS = new Set([
  10759, // Action & Adventure
  16,    // Animation
  35,    // Comedy
  80,    // Crime
  99,    // Documentary
  18,    // Drama
  10751, // Family
  36,    // History (verified: returns results)
  9648,  // Mystery
  10763, // News
  10764, // Reality
  10749, // Romance (verified: returns results)
  10765, // Sci-Fi & Fantasy
  10766, // Soap
  10767, // Talk
  10768, // War & Politics
  37,    // Western
]);

// Movie genre IDs → TV equivalents
export const MOVIE_TO_TV_GENRE: Record<number, number> = {
  28: 10759,    // Action → Action & Adventure
  12: 10759,    // Adventure → Action & Adventure
  878: 10765,   // Sci-Fi → Sci-Fi & Fantasy
  14: 10765,    // Fantasy → Sci-Fi & Fantasy
  10752: 10768, // War → War & Politics
};

// Genre display names unsupported on TV discover (for FilterSheet)
export const TV_UNSUPPORTED_GENRE_NAMES = ['Thriller', 'Horror', 'Music'] as const;

/**
 * Convert movie genre IDs to their TV equivalents.
 * IDs valid on both endpoints pass through unchanged.
 * IDs with no TV equivalent (53, 27, 10402) also pass through —
 * use sanitiseTVGenreParams to strip those.
 */
export function convertMovieGenresToTV(movieGenreIds: number[]): number[] {
  const result = new Set<number>();
  for (const id of movieGenreIds) {
    result.add(MOVIE_TO_TV_GENRE[id] ?? id);
  }
  return [...result];
}

/**
 * Sanitise a discover params object for TV calls.
 * Converts movie IDs to TV equivalents and strips IDs that have
 * no valid TV equivalent (Thriller 53, Horror 27, Musical 10402).
 */
export function sanitiseTVGenreParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const sanitised = { ...params };
  if (sanitised.with_genres) {
    const separator = String(sanitised.with_genres).includes(',') ? ',' : '|';
    const genreIds = String(sanitised.with_genres)
      .split(/[,|]/)
      .map(Number)
      .filter(Boolean);

    // Convert movie IDs → TV, then keep only valid TV IDs
    const validForTV = genreIds
      .map((id) => MOVIE_TO_TV_GENRE[id] ?? id)
      .filter((id) => VALID_TV_GENRE_IDS.has(id));

    // Deduplicate (e.g. Action 28 + Adventure 12 both → 10759)
    const unique = [...new Set(validForTV)];

    if (unique.length > 0) {
      sanitised.with_genres = unique.join(separator);
    } else {
      delete sanitised.with_genres;
    }
  }
  return sanitised;
}
