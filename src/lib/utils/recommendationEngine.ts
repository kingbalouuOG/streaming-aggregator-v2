/**
 * Recommendation Engine
 * Generates personalized content recommendations.
 *
 * When a taste vector exists (post-quiz):
 * - 60% Taste vector cosine similarity
 * - 25% TMDb similar content (for top liked items)
 * - 15% Trending/recency boost
 *
 * Fallback (no taste vector):
 * - 70% Genre affinity (based on watchlist genres and ratings)
 * - 30% TMDb similar content
 */

import storage from '@/lib/storage';
import { getWatchlist, getWatchedWithRating, type WatchlistItem } from '@/lib/storage/watchlist';
import {
  getCachedRecommendations,
  setCachedRecommendations,
  isRecommendationCacheValid,
  getDismissedIds,
  cleanExpiredDismissals,
} from '@/lib/storage/recommendations';
import { discoverMovies, discoverTV, getSimilarMovies, getSimilarTV } from '@/lib/api/tmdb';
import { GENRE_NAMES, GENRE_KEY_TO_TMDB, convertMovieGenresToTV, VALID_TV_GENRE_IDS, MOVIE_TO_TV_GENRE } from '@/lib/constants/genres';
import { getTasteProfile } from '@/lib/storage/tasteProfile';
import type { TasteVector, ConfidenceVector } from '@/lib/taste/tasteVector';
import { cosineSimilarity, DIMENSION_WEIGHTS, getGenresFromVector } from '@/lib/taste/tasteVector';
import { contentToVector } from '@/lib/taste/contentVectorMapping';
import { generateGenreCombinations } from '@/lib/taste/genreBlending';
import { debug } from '@/lib/debugLogger';

const DEBUG = __DEV__;

// ── Filter options for threading user's active filters into discovery ──

export interface DiscoverFilterOptions {
  fetchMovies?: boolean;
  fetchTV?: boolean;
  filterGenreIds?: number[];  // TMDb genre IDs from user's FilterSheet selection
}

function hasActiveFilters(opts?: DiscoverFilterOptions): boolean {
  if (!opts) return false;
  return opts.fetchMovies === false || opts.fetchTV === false || (opts.filterGenreIds?.length ?? 0) > 0;
}

// Weights when taste vector is available (per spec Part 4)
const VECTOR_WEIGHTS = {
  TASTE_VECTOR: 0.60,
  SIMILAR_CONTENT: 0.25,
  TRENDING_RECENCY: 0.15,
};

// Fallback weights when no taste vector
const WEIGHTS = {
  GENRE_AFFINITY: 0.70,
  SIMILAR_CONTENT: 0.30,
};

const AFFINITY_SCORES = {
  WATCHED_LIKED: 3,
  WATCHED_NEUTRAL: 1,
  WATCHED_DISLIKED: -1,
  WANT_TO_WATCH: 1,
};

export interface GenreAffinities {
  [genreId: string]: number;
}

interface ScoredCandidate {
  id: number;
  type: 'movie' | 'tv';
  source: 'genre' | 'popular' | 'similar';
  score: number;
  genreMatch: number[];
  similarTo?: string;
  similarToId?: number;
  genre_ids: number[];
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  popularity?: number;
}

export interface Recommendation {
  id: number;
  type: 'movie' | 'tv';
  score: number;
  reason: string;
  source: string;
  metadata: {
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string;
    releaseDate: string;
    voteAverage: number;
    genreIds: number[];
    popularity: number;
    originalLanguage: string;
  };
}

export async function calculateGenreAffinities(): Promise<GenreAffinities> {
  try {
    const watchlist = await getWatchlist();
    const affinities: GenreAffinities = {};

    watchlist.items.forEach((item) => {
      let multiplier: number;
      if (item.status === 'watched') {
        if (item.rating === 1) multiplier = AFFINITY_SCORES.WATCHED_LIKED;
        else if (item.rating === -1) multiplier = AFFINITY_SCORES.WATCHED_DISLIKED;
        else multiplier = AFFINITY_SCORES.WATCHED_NEUTRAL;
      } else {
        multiplier = AFFINITY_SCORES.WANT_TO_WATCH;
      }

      const genreIds = item.metadata?.genreIds || [];
      genreIds.forEach((genreId) => {
        affinities[genreId] = (affinities[genreId] || 0) + multiplier;
      });
    });

    if (DEBUG) console.log('[RecommendationEngine] Genre affinities:', affinities);
    return affinities;
  } catch (error) {
    console.error('[RecommendationEngine] Error calculating affinities:', error);
    return {};
  }
}

export function getTopGenres(affinities: GenreAffinities, count = 3) {
  return Object.entries(affinities)
    .map(([genreId, score]) => ({ genreId: parseInt(genreId), score: score as number }))
    .filter((g) => g.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

async function getTopLikedItems(count = 3): Promise<WatchlistItem[]> {
  try {
    const likedItems = await getWatchedWithRating(1);
    return likedItems.sort((a, b) => b.addedAt - a.addedAt).slice(0, count);
  } catch (error) {
    console.error('[RecommendationEngine] Error getting liked items:', error);
    return [];
  }
}

async function fetchGenreBasedContent(
  topGenres: { genreId: number; score: number }[],
  region = 'GB',
  providerIds: number[] = [],
  tasteVector?: TasteVector | null,
  filterOpts?: DiscoverFilterOptions
): Promise<ScoredCandidate[]> {
  try {
    const providerParam = providerIds.length > 0 ? { with_watch_providers: providerIds.join('|'), watch_region: region } : { watch_region: region };
    const doMovies = filterOpts?.fetchMovies !== false;
    const doTV = filterOpts?.fetchTV !== false;
    const userFilterGenres = filterOpts?.filterGenreIds || [];

    if (hasActiveFilters(filterOpts)) {
      debug.info('FilterThreading', 'fetchGenreBasedContent filters', {
        doMovies,
        doTV,
        filterGenres: userFilterGenres.map((id) => GENRE_NAMES[id] || id),
      });
    }

    // Vector-based AND genre queries: pairwise combos for multi-genre discovery
    if (tasteVector) {
      const vectorKeys = getGenresFromVector(tasteVector);
      const scoredGenres = vectorKeys
        .map((key) => ({ genreId: GENRE_KEY_TO_TMDB[key], score: tasteVector[key] }))
        .filter((g): g is { genreId: number; score: number } => g.genreId > 0);

      // Build combos: filter path vs normal path are MUTUALLY EXCLUSIVE
      let combos: number[][];
      if (userFilterGenres.length > 0) {
        // Filter path: filter genre required in every combo, paired with top vector genres
        const vectorGenreIds = scoredGenres
          .map((g) => g.genreId)
          .filter((id) => !userFilterGenres.includes(id)); // exclude overlap
        const rawCombos: number[][] = [];
        for (const filterG of userFilterGenres) {
          for (const vectorG of vectorGenreIds) {
            rawCombos.push([filterG, vectorG]);
          }
          rawCombos.push([filterG]); // standalone filter genre for broader results
        }
        // Deduplicate by combo signature (safety net)
        const seen = new Set<string>();
        combos = rawCombos.filter((c) => {
          const key = [...c].sort().join(',');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 4);
      } else {
        // No filter: use existing pairwise vector genre combos
        combos = generateGenreCombinations(scoredGenres).slice(0, 4);
      }

      debug.info('RecommendationEngine', 'Genre combinations', {
        vectorGenreCount: scoredGenres.length,
        topVectorGenres: scoredGenres.slice(0, 5).map((g) => ({ genreId: g.genreId, name: GENRE_NAMES[g.genreId], score: Math.round(g.score * 100) / 100 })),
        combos: combos.map((c) => c.map((id) => GENRE_NAMES[id] || id)),
        comboCount: combos.length,
        filterGenres: userFilterGenres.length > 0 ? userFilterGenres.map((id) => GENRE_NAMES[id] || id) : undefined,
      });

      if (combos.length > 0) {
        // Fire AND queries in parallel (max 4 combos × 2 endpoints = 8 API calls)
        const comboPromises = combos.flatMap((combo) => {
          const movieGenreStr = combo.join(','); // comma = AND
          const tvCombo = convertMovieGenresToTV(combo)
            .filter((id) => VALID_TV_GENRE_IDS.has(id));
          const tvGenreStr = tvCombo.length > 0 ? tvCombo.join(',') : '';

          return [
            doMovies
              ? discoverMovies({ with_genres: movieGenreStr, page: 1, sort_by: 'popularity.desc', ...providerParam })
              : Promise.resolve({ data: { results: [] } }),
            doTV && tvGenreStr
              ? discoverTV({ with_genres: tvGenreStr, page: 1, sort_by: 'popularity.desc', ...providerParam })
              : Promise.resolve({ data: { results: [] } }),
          ];
        });

        const responses = await Promise.all(comboPromises);
        const seenIds = new Set<string>();
        const allResults: ScoredCandidate[] = [];

        for (let i = 0; i < responses.length; i += 2) {
          const movieRes = responses[i];
          const tvRes = responses[i + 1];
          const comboGenres = combos[i / 2];

          for (const m of (movieRes.data?.results || [])) {
            const key = `movie-${m.id}`;
            if (seenIds.has(key)) continue;
            seenIds.add(key);
            allResults.push({
              ...m, type: 'movie' as const, source: 'genre' as const, score: 0,
              genreMatch: comboGenres.filter((gId: number) => (m.genre_ids || []).includes(gId)),
              genre_ids: m.genre_ids || [],
            });
          }

          for (const t of (tvRes.data?.results || [])) {
            const key = `tv-${t.id}`;
            if (seenIds.has(key)) continue;
            seenIds.add(key);
            allResults.push({
              ...t, type: 'tv' as const, source: 'genre' as const, score: 0,
              genreMatch: comboGenres.filter((gId: number) => (t.genre_ids || []).includes(gId)),
              genre_ids: t.genre_ids || [],
            });
          }
        }

        if (DEBUG) console.log(`[RecommendationEngine] AND queries: ${combos.length} combos → ${allResults.length} unique candidates`);
        return allResults;
      }
      // No valid combos from vector — fall through to OR approach
    }

    // Popular fallback when no genre signal at all
    if (topGenres.length === 0 && userFilterGenres.length === 0) {
      if (DEBUG) console.log('[RecommendationEngine] No top genres, using popular content');
      const [moviesRes, tvRes] = await Promise.all([
        doMovies ? discoverMovies({ page: 1, ...providerParam }) : Promise.resolve({ data: { results: [] } }),
        doTV ? discoverTV({ page: 1, ...providerParam }) : Promise.resolve({ data: { results: [] } }),
      ]);
      return [
        ...(moviesRes.data?.results || []).map((m: any) => ({ ...m, type: 'movie' as const, source: 'popular' as const, genreMatch: [], genre_ids: m.genre_ids || [], score: 0 })),
        ...(tvRes.data?.results || []).map((t: any) => ({ ...t, type: 'tv' as const, source: 'popular' as const, genreMatch: [], genre_ids: t.genre_ids || [], score: 0 })),
      ];
    }

    // OR genre query approach (pre-vector fallback)
    // When filter genres active, use them instead of affinity-derived genres
    const genreIds = userFilterGenres.length > 0
      ? userFilterGenres
      : topGenres.map((g) => g.genreId);
    const genreString = genreIds.join('|');

    // Convert genre IDs for TV discover (e.g. 878→10765, 28→10759)
    const tvGenreIds = convertMovieGenresToTV(genreIds)
      .filter((id) => VALID_TV_GENRE_IDS.has(id));
    const tvGenreString = tvGenreIds.length > 0 ? tvGenreIds.join('|') : '';

    const [moviesRes, tvRes] = await Promise.all([
      doMovies
        ? discoverMovies({ with_genres: genreString, page: 1, sort_by: 'popularity.desc', ...providerParam })
        : Promise.resolve({ data: { results: [] } }),
      doTV && tvGenreString
        ? discoverTV({ with_genres: tvGenreString, page: 1, sort_by: 'popularity.desc', ...providerParam })
        : Promise.resolve({ data: { results: [] } }),
    ]);

    return [
      ...(moviesRes.data?.results || []).map((m: any) => ({
        ...m, type: 'movie' as const, source: 'genre' as const, score: 0,
        genreMatch: genreIds.filter((gId) => (m.genre_ids || []).includes(gId)),
        genre_ids: m.genre_ids || [],
      })),
      ...(tvRes.data?.results || []).map((t: any) => ({
        ...t, type: 'tv' as const, source: 'genre' as const, score: 0,
        genreMatch: genreIds.filter((gId) => (t.genre_ids || []).includes(gId)),
        genre_ids: t.genre_ids || [],
      })),
    ];
  } catch (error) {
    console.error('[RecommendationEngine] Error fetching genre content:', error);
    return [];
  }
}

async function fetchSimilarContent(
  likedItems: WatchlistItem[],
  filterOpts?: DiscoverFilterOptions
): Promise<ScoredCandidate[]> {
  try {
    if (likedItems.length === 0) return [];

    // Content type filtering: skip movie/TV similar calls per filter
    const filteredLiked = likedItems.filter((item) => {
      if (item.type === 'movie' && filterOpts?.fetchMovies === false) return false;
      if (item.type === 'tv' && filterOpts?.fetchTV === false) return false;
      return true;
    });

    if (hasActiveFilters(filterOpts)) {
      debug.info('FilterThreading', 'fetchSimilarContent', {
        totalLiked: likedItems.length,
        afterTypeFilter: filteredLiked.length,
        filterGenres: (filterOpts?.filterGenreIds || []).map((id) => GENRE_NAMES[id] || id),
      });
    }

    if (filteredLiked.length === 0) return [];

    const results = await Promise.all(
      filteredLiked.map((item) =>
        item.type === 'movie' ? getSimilarMovies(item.id) : getSimilarTV(item.id)
      )
    );

    const allSimilar: ScoredCandidate[] = [];
    results.forEach((result, index) => {
      if (result.success && result.data?.results) {
        const sourceItem = filteredLiked[index];
        result.data.results.forEach((item: any) => {
          allSimilar.push({
            ...item,
            type: sourceItem.type,
            source: 'similar' as const,
            score: 0,
            genreMatch: [],
            genre_ids: item.genre_ids || [],
            similarTo: sourceItem.metadata?.title || 'a title you liked',
            similarToId: sourceItem.id,
          });
        });
      }
    });

    // Genre post-filter: TMDb similar endpoints don't accept genre params
    // Must expand filter set to include TV equivalents (28→10759, 878→10765, etc.)
    const filterGenres = filterOpts?.filterGenreIds;
    if (filterGenres && filterGenres.length > 0) {
      const filterSet = new Set(filterGenres);
      const tvEquivalents = new Set(
        filterGenres.flatMap((id) => {
          const tvId = MOVIE_TO_TV_GENRE[id];
          return tvId ? [tvId] : [];
        })
      );
      const filtered = allSimilar.filter((item) =>
        (item.genre_ids || []).some((gId: number) => filterSet.has(gId) || tvEquivalents.has(gId))
      );
      debug.info('FilterThreading', 'Similar genre post-filter', {
        before: allSimilar.length,
        after: filtered.length,
        tvEquivalents: [...tvEquivalents],
      });
      return filtered;
    }

    return allSimilar;
  } catch (error) {
    console.error('[RecommendationEngine] Error fetching similar content:', error);
    return [];
  }
}

function scoreCandidate(item: ScoredCandidate, affinities: GenreAffinities, tasteVector?: TasteVector | null, confidence?: ConfidenceVector | null): number {
  let score = 0;

  if (tasteVector) {
    // Vector-based scoring (per spec Part 4)
    const dateStr = item.release_date || item.first_air_date || '';
    const contentMeta = {
      genreIds: item.genre_ids || [],
      popularity: item.popularity || 0,
      voteCount: 100, // Not available on discover results; use reasonable default
      releaseYear: dateStr ? parseInt(dateStr.slice(0, 4)) || null : null,
      originalLanguage: (item as any).original_language || null,
    };
    const contentVector = contentToVector(contentMeta);
    const similarity = cosineSimilarity(tasteVector, contentVector, DIMENSION_WEIGHTS, confidence || undefined); // 0-100

    if (item.source === 'similar') {
      score += similarity * VECTOR_WEIGHTS.TASTE_VECTOR;
      score += 50 * VECTOR_WEIGHTS.SIMILAR_CONTENT;
    } else {
      score += similarity * VECTOR_WEIGHTS.TASTE_VECTOR;
    }

    // Trending/recency component
    const popularity = item.popularity || 0;
    const trendingScore = Math.min(popularity / 100, 1) * 100;
    score += trendingScore * VECTOR_WEIGHTS.TRENDING_RECENCY;
  } else {
    // Fallback: genre affinity scoring (original algorithm)
    const genreIds = item.genre_ids || [];
    let genreScore = 0;
    genreIds.forEach((genreId) => {
      genreScore += affinities[genreId] || 0;
    });
    const normalizedGenreScore = Math.min(genreScore / 10, 1) * 100;

    if (item.source === 'genre') {
      score += normalizedGenreScore * WEIGHTS.GENRE_AFFINITY;
    } else if (item.source === 'similar') {
      score += 50 * WEIGHTS.SIMILAR_CONTENT;
      score += normalizedGenreScore * WEIGHTS.GENRE_AFFINITY * 0.5;
    }

    const popularity = item.popularity || 0;
    score += Math.min(popularity / 100, 1) * 10;
  }

  // Rating bonus (both paths)
  const rating = item.vote_average || 0;
  if (rating >= 7) {
    score += (rating - 7) * 3;
  }

  return Math.round(score * 100) / 100;
}

function applyDiversityFilter(rankedItems: ScoredCandidate[], maxPerGenre = 3, targetCount = 20): ScoredCandidate[] {
  const result: ScoredCandidate[] = [];
  const genreCounts: Record<number, number> = {};
  const typeCounts: Record<string, number> = { movie: 0, tv: 0 };
  const seenIds = new Set<string>();
  const maxPerType = Math.ceil(targetCount * 0.7); // Max 70% of one type

  for (const item of rankedItems) {
    const uniqueKey = `${item.type}-${item.id}`;
    if (seenIds.has(uniqueKey)) continue;

    const primaryGenre = (item.genre_ids || [])[0];

    if (result.length < 10 && primaryGenre) {
      if ((genreCounts[primaryGenre] || 0) >= maxPerGenre) continue;
    }

    // Type balance: don't let one type dominate
    if ((typeCounts[item.type] || 0) >= maxPerType) continue;

    result.push(item);
    seenIds.add(uniqueKey);
    typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
    if (primaryGenre) {
      genreCounts[primaryGenre] = (genreCounts[primaryGenre] || 0) + 1;
    }

    if (result.length >= targetCount) break;
  }

  return result;
}

function generateReasonText(item: ScoredCandidate, affinities: GenreAffinities, tasteVector?: TasteVector | null, confidence?: ConfidenceVector | null): string {
  if (item.source === 'similar' && item.similarTo) {
    return `Similar to ${item.similarTo}`;
  }

  // Vector-enhanced reasons: match on content's strongest genre vs user's vector
  if (tasteVector) {
    const dateStr = item.release_date || item.first_air_date || '';
    const contentMeta = {
      genreIds: item.genre_ids || [],
      popularity: item.popularity || 0,
      voteCount: 100,
      releaseYear: dateStr ? parseInt(dateStr.slice(0, 4)) || null : null,
      originalLanguage: (item as any).original_language || null,
    };
    const contentVector = contentToVector(contentMeta);
    const similarity = cosineSimilarity(tasteVector, contentVector, DIMENSION_WEIGHTS, confidence || undefined);

    if (similarity >= 80) {
      // Find strongest matching genre
      const genreIds = item.genre_ids || [];
      for (const gId of genreIds) {
        if (GENRE_NAMES[gId]) return `Great match for your taste in ${GENRE_NAMES[gId]}`;
      }
      return 'Great match for your taste';
    }
    if (similarity >= 60) {
      const genreIds = item.genre_ids || [];
      for (const gId of genreIds) {
        if (GENRE_NAMES[gId]) return `Matches your ${GENRE_NAMES[gId]} preferences`;
      }
      return 'Matches your preferences';
    }
  }

  // Fallback: genre affinity reasons
  const genreIds = item.genreMatch?.length ? item.genreMatch : (item.genre_ids || []);
  let bestGenre: number | null = null;
  let bestScore = 0;

  genreIds.forEach((genreId) => {
    const score = affinities[genreId] || 0;
    if (score > bestScore) {
      bestScore = score;
      bestGenre = genreId;
    }
  });

  if (bestGenre && GENRE_NAMES[bestGenre]) {
    return `Because you like ${GENRE_NAMES[bestGenre]}`;
  }

  return 'Popular in your region';
}

export async function generateRecommendations(
  userPlatforms: number[] = [],
  region = 'GB',
  filterOpts?: DiscoverFilterOptions
): Promise<Recommendation[]> {
  try {
    await cleanExpiredDismissals();

    if (hasActiveFilters(filterOpts)) {
      debug.info('FilterThreading', 'generateRecommendations — filtered, bypassing cache', {
        fetchMovies: filterOpts?.fetchMovies,
        fetchTV: filterOpts?.fetchTV,
        filterGenres: (filterOpts?.filterGenreIds || []).map((id) => GENRE_NAMES[id] || id),
      });
    }

    // Only use cache when no filters active — filtered requests always generate fresh
    if (!hasActiveFilters(filterOpts)) {
      const cached = await getCachedRecommendations();
      const isValid = await isRecommendationCacheValid(cached);

      if (isValid && cached.recommendations.length > 0) {
        if (DEBUG) console.log('[RecommendationEngine] Using cached recommendations');
        return cached.recommendations;
      }
    }

    if (DEBUG) console.log('[RecommendationEngine] Generating fresh recommendations', hasActiveFilters(filterOpts) ? '(filtered)' : '');

    const [affinities, tasteProfile] = await Promise.all([
      calculateGenreAffinities(),
      getTasteProfile(),
    ]);
    const tasteVector = tasteProfile?.vector || null;
    const confidence = tasteProfile?.confidence || null;
    const topGenres = getTopGenres(affinities, 3);
    const likedItems = await getTopLikedItems(3);

    if (DEBUG) {
      console.log('[RecommendationEngine] Top genres:', topGenres);
      console.log('[RecommendationEngine] Liked items:', likedItems.length);
      console.log('[RecommendationEngine] Taste vector available:', !!tasteVector);
    }

    const [genreContent, similarContent] = await Promise.all([
      fetchGenreBasedContent(topGenres, region, userPlatforms, tasteVector, filterOpts),
      fetchSimilarContent(likedItems, filterOpts),
    ]);

    const allCandidates = [...genreContent, ...similarContent];
    const scored = allCandidates.map((item) => ({
      ...item,
      score: scoreCandidate(item, affinities, tasteVector, confidence),
    }));

    scored.sort((a, b) => b.score - a.score);

    debug.info('RecommendationEngine', 'Top scores', {
      totalCandidates: scored.length,
      genreSourced: genreContent.length,
      similarSourced: similarContent.length,
      filtered: hasActiveFilters(filterOpts),
      top5: scored.slice(0, 5).map((i) => ({
        id: `${i.type}-${i.id}`,
        title: i.title || i.name,
        genreIds: i.genre_ids,
        score: i.score,
        source: i.source,
      })),
    });

    // Filter out watchlist items
    const watchlist = await getWatchlist();
    const watchlistIds = new Set(watchlist.items.map((i) => `${i.type}-${i.id}`));
    const filteredByWatchlist = scored.filter((item) => !watchlistIds.has(`${item.type}-${item.id}`));

    // Filter out dismissed
    const dismissedIds = await getDismissedIds();
    const filteredByDismissed = filteredByWatchlist.filter((item) => !dismissedIds.has(`${item.type}-${item.id}`));

    const diverse = applyDiversityFilter(filteredByDismissed, 3, 25);

    const recommendations: Recommendation[] = diverse.map((item) => ({
      id: item.id,
      type: item.type,
      score: item.score,
      reason: generateReasonText(item, affinities, tasteVector, confidence),
      source: item.source,
      metadata: {
        title: item.title || item.name || 'Unknown',
        posterPath: item.poster_path || null,
        backdropPath: item.backdrop_path || null,
        overview: item.overview || '',
        releaseDate: item.release_date || item.first_air_date || '',
        voteAverage: item.vote_average || 0,
        genreIds: item.genre_ids || [],
        popularity: item.popularity || 0,
        originalLanguage: item.original_language || 'en',
      },
    }));

    // Only cache unfiltered results — filtered results are ephemeral
    if (!hasActiveFilters(filterOpts)) {
      await setCachedRecommendations(recommendations, {
        genreAffinities: affinities,
        likedItemIds: likedItems.map((i) => i.id),
      });
    }

    if (DEBUG) console.log('[RecommendationEngine] Generated', recommendations.length, 'recommendations');

    return recommendations;
  } catch (error) {
    console.error('[RecommendationEngine] Error generating recommendations:', error);
    return [];
  }
}

const HIDDEN_GEMS_CACHE_KEY = '@app_hidden_gems';
const HIDDEN_GEMS_TTL = 6 * 60 * 60 * 1000; // 6 hours

export async function generateHiddenGems(
  userPlatforms: number[] = [],
  region = 'GB',
  filterOpts?: DiscoverFilterOptions
): Promise<Recommendation[]> {
  try {
    // Only use cache when no filters active
    if (!hasActiveFilters(filterOpts)) {
      const rawCache = await storage.getItem(HIDDEN_GEMS_CACHE_KEY);
      if (rawCache) {
        const cache = JSON.parse(rawCache);
        if (Date.now() < cache.expiresAt && cache.items?.length > 0) {
          if (DEBUG) console.log('[HiddenGems] Using cached results');
          return cache.items;
        }
      }
    }

    if (DEBUG) console.log('[HiddenGems] Generating fresh hidden gems', hasActiveFilters(filterOpts) ? '(filtered)' : '');

    const doMovies = filterOpts?.fetchMovies !== false;
    const doTV = filterOpts?.fetchTV !== false;
    const userFilterGenres = filterOpts?.filterGenreIds || [];

    if (hasActiveFilters(filterOpts)) {
      debug.info('FilterThreading', 'generateHiddenGems — filtered, bypassing cache', {
        doMovies,
        doTV,
        filterGenres: userFilterGenres.map((id) => GENRE_NAMES[id] || id),
      });
    }

    const [affinities, tasteProfile] = await Promise.all([
      calculateGenreAffinities(),
      getTasteProfile(),
    ]);
    const tasteVector = tasteProfile?.vector || null;
    const confidence = tasteProfile?.confidence || null;
    const topGenres = getTopGenres(affinities, 3);

    const providerParam = userPlatforms.length > 0
      ? { with_watch_providers: userPlatforms.join('|'), watch_region: region }
      : { watch_region: region };

    const movieDiscoverParams: Record<string, unknown> = {
      sort_by: 'vote_average.desc',
      'vote_count.gte': 50,
      'vote_count.lte': 500,
      'vote_average.gte': 7.5,
      'popularity.lte': 15,
      ...providerParam,
    };

    // Genre filtering: user filter genres REPLACE taste genres (not merge)
    // Vector scoring determines ordering within filtered results
    if (userFilterGenres.length > 0) {
      movieDiscoverParams.with_genres = userFilterGenres.join(',');
    } else {
      const genreString = topGenres.length > 0 ? topGenres.map((g) => g.genreId).join('|') : '';
      if (genreString) movieDiscoverParams.with_genres = genreString;
    }

    // Build TV params with converted genre IDs
    const tvDiscoverParams = { ...movieDiscoverParams };
    if (userFilterGenres.length > 0) {
      // Convert filter genres for TV discover
      const tvFilterIds = convertMovieGenresToTV(userFilterGenres)
        .filter((id) => VALID_TV_GENRE_IDS.has(id));
      if (tvFilterIds.length > 0) {
        tvDiscoverParams.with_genres = tvFilterIds.join(',');
      } else {
        delete tvDiscoverParams.with_genres;
      }
    } else if (movieDiscoverParams.with_genres) {
      const genreIds = topGenres.map((g) => g.genreId);
      const tvGenreIds = convertMovieGenresToTV(genreIds)
        .filter((id) => VALID_TV_GENRE_IDS.has(id));
      if (tvGenreIds.length > 0) {
        tvDiscoverParams.with_genres = tvGenreIds.join('|');
      } else {
        delete tvDiscoverParams.with_genres;
      }
    }

    const [moviesRes, tvRes] = await Promise.all([
      doMovies ? discoverMovies(movieDiscoverParams) : Promise.resolve({ data: { results: [] } }),
      doTV ? discoverTV(tvDiscoverParams) : Promise.resolve({ data: { results: [] } }),
    ]);

    const allResults = [
      ...(moviesRes.data?.results || []).map((m: any) => ({ ...m, mediaType: 'movie' as const })),
      ...(tvRes.data?.results || []).map((t: any) => ({ ...t, mediaType: 'tv' as const })),
    ];

    // Filter out watchlist items
    const watchlist = await getWatchlist();
    const watchlistIds = new Set(watchlist.items.map((i) => `${i.type}-${i.id}`));
    const filtered = allResults.filter((item) => !watchlistIds.has(`${item.mediaType}-${item.id}`));

    // Sort by taste vector similarity when available
    if (tasteVector) {
      filtered.sort((a, b) => {
        const aDate = a.release_date || a.first_air_date || '';
        const bDate = b.release_date || b.first_air_date || '';
        const aVec = contentToVector({ genreIds: a.genre_ids || [], popularity: a.popularity || 0, voteCount: a.vote_count || 50, releaseYear: aDate ? parseInt(aDate.slice(0, 4)) || null : null, originalLanguage: a.original_language || null });
        const bVec = contentToVector({ genreIds: b.genre_ids || [], popularity: b.popularity || 0, voteCount: b.vote_count || 50, releaseYear: bDate ? parseInt(bDate.slice(0, 4)) || null : null, originalLanguage: b.original_language || null });
        return cosineSimilarity(tasteVector, bVec, DIMENSION_WEIGHTS, confidence || undefined) - cosineSimilarity(tasteVector, aVec, DIMENSION_WEIGHTS, confidence || undefined);
      });
    }

    // Diversity filter: max 2 per primary genre
    const genreCounts: Record<number, number> = {};
    const diverse: typeof filtered = [];
    for (const item of filtered) {
      const primaryGenre = (item.genre_ids || [])[0];
      if (primaryGenre && (genreCounts[primaryGenre] || 0) >= 2) continue;
      diverse.push(item);
      if (primaryGenre) genreCounts[primaryGenre] = (genreCounts[primaryGenre] || 0) + 1;
      if (diverse.length >= 15) break;
    }

    const gems: Recommendation[] = diverse.map((item) => {
      const primaryGenre = (item.genre_ids || [])[0];
      const genreName = primaryGenre ? GENRE_NAMES[primaryGenre] : null;
      return {
        id: item.id,
        type: item.mediaType,
        score: item.vote_average || 0,
        reason: genreName ? `Hidden gem in ${genreName}` : 'Hidden gem',
        source: 'hidden_gem',
        metadata: {
          title: item.title || item.name || 'Unknown',
          posterPath: item.poster_path || null,
          backdropPath: item.backdrop_path || null,
          overview: item.overview || '',
          releaseDate: item.release_date || item.first_air_date || '',
          voteAverage: item.vote_average || 0,
          genreIds: item.genre_ids || [],
          popularity: item.popularity || 0,
          originalLanguage: item.original_language || 'en',
        },
      };
    });

    debug.info('HiddenGems', 'Generated', {
      totalFetched: allResults.length,
      afterWatchlistFilter: filtered.length,
      afterDiversity: diverse.length,
      vectorSorted: !!tasteVector,
      filtered: hasActiveFilters(filterOpts),
      topGem: gems[0] ? { title: gems[0].metadata.title, score: gems[0].score, genreIds: gems[0].metadata.genreIds } : null,
    });

    // Only cache unfiltered results
    if (!hasActiveFilters(filterOpts)) {
      await storage.setItem(HIDDEN_GEMS_CACHE_KEY, JSON.stringify({
        items: gems,
        expiresAt: Date.now() + HIDDEN_GEMS_TTL,
      }));
    }

    if (DEBUG) console.log('[HiddenGems] Generated', gems.length, 'hidden gems');
    return gems;
  } catch (error) {
    console.error('[HiddenGems] Error:', error);
    return [];
  }
}
