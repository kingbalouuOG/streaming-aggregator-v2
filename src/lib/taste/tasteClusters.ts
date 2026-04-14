/**
 * Taste Clusters
 *
 * 16 taste archetypes that replace raw genre selection in onboarding.
 * Each cluster maps to a partial 24D vector encoding genre affinities
 * AND meta dimensions (tone, pacing, era, popularity, intensity).
 *
 * Users select 3-5 clusters. Their partial vectors are averaged into
 * a seed vector that feeds the quiz and recommendation engine.
 */

import type { TasteVector, Dimension } from './tasteVector';
import { createEmptyVector, clampVector, ALL_DIMENSIONS, GENRE_DIMENSIONS } from './tasteVector';
import { GENRE_KEY_TO_TMDB } from '@/lib/constants/genres';
import { debug } from '../debugLogger';

// ── Types ────────────────────────────────────────────────────────

export interface TasteCluster {
  id: string;
  name: string;
  description: string;
  emoji: string;
  vector: Partial<Record<Dimension, number>>;
  // V2 fields (added Phase 3, Task 2)
  adjective: string;
  mood: string;
  tmdbGenreIds: number[];
  representativeTmdbIds: { tmdbId: number; mediaType: 'movie' | 'tv' }[];
}

// ── Constants ────────────────────────────────────────────────────

export const MIN_CLUSTERS = 3;
export const MAX_CLUSTERS = 5;

/**
 * All 14 taste clusters, ordered for display (most universally appealing first).
 *
 * IMPORTANT: Only include a dimension if it carries meaningful signal.
 * - Omitting a dimension = "no opinion" (excluded from averaging)
 * - Setting 0.0 = "explicitly neutral" (included in averaging, drags others toward zero)
 *
 * Genre seed magnitudes are compressed (val >= 0.5 → val * 0.6 + 0.1)
 * to leave headroom for the quiz to refine without hitting cap collisions.
 */
export const TASTE_CLUSTERS: TasteCluster[] = [
  // 1. Feel-Good & Funny
  {
    id: 'feel-good-funny',
    name: 'Feel-Good & Funny',
    description: 'Light comedies, sitcoms, and uplifting stories',
    emoji: '😍',
    vector: {
      comedy: 0.64,
      drama: 0.2,
      tone: 0.8,
      intensity: -0.4,
      pacing: 0.3,
    },
    adjective: 'feel-good',
    mood: 'light-hearted comedy and uplifting stories',
    tmdbGenreIds: [35, 18],
    representativeTmdbIds: [
      { tmdbId: 18785, mediaType: 'movie' }, // The Hangover
      { tmdbId: 8363, mediaType: 'movie' },  // Superbad
      { tmdbId: 10625, mediaType: 'movie' }, // Mean Girls
      { tmdbId: 55721, mediaType: 'movie' }, // Bridesmaids
    ],
  },
  // 2. Action & Adrenaline
  {
    id: 'action-adrenaline',
    name: 'Action & Adrenaline',
    description: 'Explosions, fights, and high-stakes chases',
    emoji: '🚀',
    vector: {
      action: 0.64,
      adventure: 0.4,
      thriller: 0.3,
      intensity: 0.75,
      pacing: 0.9,
      tone: -0.2,
    },
    adjective: 'intense',
    mood: 'high-stakes action and adrenaline',
    tmdbGenreIds: [28, 12, 53],
    representativeTmdbIds: [
      { tmdbId: 562, mediaType: 'movie' },   // Die Hard
      { tmdbId: 680, mediaType: 'movie' },   // Pulp Fiction
      { tmdbId: 857, mediaType: 'movie' },   // Saving Private Ryan
    ],
  },
  // 3. Dark Thrillers
  {
    id: 'dark-thrillers',
    name: 'Dark Thrillers',
    description: 'Tense, gritty crime and suspense',
    emoji: '🔪',
    vector: {
      thriller: 0.64,
      crime: 0.46,
      mystery: 0.3,
      tone: -0.8,
      intensity: 0.7,
      pacing: 0.7,
    },
    adjective: 'dark',
    mood: 'gritty crime and tense suspense',
    tmdbGenreIds: [53, 80, 9648],
    representativeTmdbIds: [
      { tmdbId: 807, mediaType: 'movie' },    // Se7en
      { tmdbId: 210577, mediaType: 'movie' }, // Gone Girl
      { tmdbId: 146233, mediaType: 'movie' }, // Prisoners
      { tmdbId: 273481, mediaType: 'movie' }, // Sicario
    ],
  },
  // 4. Rom-Coms & Love Stories
  {
    id: 'rom-coms-love-stories',
    name: 'Rom-Coms & Love',
    description: 'Romantic comedies and sweeping romances',
    emoji: '💕',
    vector: {
      romance: 0.64,
      comedy: 0.46,
      drama: 0.3,
      tone: 0.7,
      intensity: -0.3,
    },
    adjective: 'romantic',
    mood: 'sweeping romances and charming comedy',
    tmdbGenreIds: [10749, 35, 18],
    representativeTmdbIds: [
      { tmdbId: 11036, mediaType: 'movie' }, // The Notebook
      { tmdbId: 455207, mediaType: 'movie' }, // Crazy Rich Asians
      { tmdbId: 4348, mediaType: 'movie' },  // Pride & Prejudice
      { tmdbId: 13, mediaType: 'movie' },    // Forrest Gump
    ],
  },
  // 5. Epic Sci-Fi & Fantasy
  {
    id: 'epic-scifi-fantasy',
    name: 'Epic Sci-Fi & Fantasy',
    description: 'Grand worlds, speculative stories, and mythic adventures',
    emoji: '🔮',
    vector: {
      scifi: 0.58,
      fantasy: 0.58,
      adventure: 0.4,
      intensity: 0.2,
      pacing: -0.2,
      era: -0.2,
    },
    adjective: 'cerebral',
    mood: 'speculative worlds and grand adventures',
    tmdbGenreIds: [878, 14, 12],
    representativeTmdbIds: [
      { tmdbId: 157336, mediaType: 'movie' }, // Interstellar
      { tmdbId: 335984, mediaType: 'movie' }, // Blade Runner 2049
      { tmdbId: 329865, mediaType: 'movie' }, // Arrival
    ],
  },
  // 6. Horror & Supernatural
  {
    id: 'horror-supernatural',
    name: 'Horror & Supernatural',
    description: 'Scary, creepy, and unsettling',
    emoji: '👻',
    vector: {
      horror: 0.64,
      thriller: 0.4,
      mystery: 0.2,
      tone: -0.9,
      intensity: 0.75,
      pacing: 0.2,
    },
    adjective: 'unsettling',
    mood: 'creepy horror and supernatural dread',
    tmdbGenreIds: [27, 53, 9648],
    representativeTmdbIds: [
      { tmdbId: 419430, mediaType: 'movie' }, // Get Out
      { tmdbId: 447332, mediaType: 'movie' }, // A Quiet Place
      { tmdbId: 126889, mediaType: 'movie' }, // Alien: Covenant
    ],
  },
  // 7. Mind-Bending Mysteries
  {
    id: 'mind-bending-mysteries',
    name: 'Mind-Bending',
    description: 'Psychological puzzles and twist-driven stories',
    emoji: '🧠',
    vector: {
      mystery: 0.64,
      thriller: 0.4,
      scifi: 0.2,
      tone: -0.5,
      intensity: 0.5,
      pacing: -0.3,
    },
    adjective: 'cerebral',
    mood: 'psychological depth and twist-driven puzzles',
    tmdbGenreIds: [9648, 53, 878],
    representativeTmdbIds: [
      { tmdbId: 27205, mediaType: 'movie' }, // Inception
      { tmdbId: 11324, mediaType: 'movie' }, // Shutter Island
      { tmdbId: 1124, mediaType: 'movie' },  // The Prestige
      { tmdbId: 77, mediaType: 'movie' },    // Memento
    ],
  },
  // 8. Heartfelt Drama
  {
    id: 'heartfelt-drama',
    name: 'Heartfelt Drama',
    description: 'Character-driven emotional stories',
    emoji: '💚',
    vector: {
      drama: 0.64,
      romance: 0.2,
      tone: 0.3,
      intensity: 0.2,
      pacing: -0.4,
    },
    adjective: 'heartfelt',
    mood: 'slow-burn character dramas and emotional depth',
    tmdbGenreIds: [18, 10749],
    representativeTmdbIds: [
      { tmdbId: 278, mediaType: 'movie' },    // The Shawshank Redemption
      { tmdbId: 238, mediaType: 'movie' },    // The Godfather
      { tmdbId: 13, mediaType: 'movie' },     // Forrest Gump
    ],
  },
  // 9. True Crime & Real Stories
  {
    id: 'true-crime-real-stories',
    name: 'True Crime',
    description: 'Documentaries, docuseries, and based-on-true-events',
    emoji: '📰',
    vector: {
      documentary: 0.64,
      crime: 0.4,
      history: 0.3,
      tone: -0.5,
      intensity: 0.5,
      pacing: -0.2,
    },
    adjective: 'gripping',
    mood: 'true crime investigations and real-world stories',
    tmdbGenreIds: [99, 80, 36],
    representativeTmdbIds: [
      { tmdbId: 1430, mediaType: 'movie' },  // Bowling for Columbine
      { tmdbId: 64439, mediaType: 'tv' },    // Making a Murderer
    ],
  },
  // 10. Anime & Animation
  {
    id: 'anime-animation',
    name: 'Anime & Animation',
    description: 'Anime, animated series, and animated films',
    emoji: '🍥',
    vector: {
      animation: 0.64,
      action: 0.3,
      fantasy: 0.3,
      intensity: 0.3,
      pacing: 0.2,
    },
    adjective: 'vibrant',
    mood: 'animated worlds and visual storytelling',
    tmdbGenreIds: [16, 28, 14],
    representativeTmdbIds: [
      { tmdbId: 324857, mediaType: 'movie' }, // Spider-Man: Into the Spider-Verse
      { tmdbId: 129, mediaType: 'movie' },    // Spirited Away
      { tmdbId: 862, mediaType: 'movie' },    // Toy Story
      { tmdbId: 150540, mediaType: 'movie' }, // Inside Out
    ],
  },
  // 11. Prestige & Award-Winners
  {
    id: 'prestige-award-winners',
    name: 'Award-Winners',
    description: 'Critically acclaimed, Oscar- and BAFTA-calibre',
    emoji: '🏆',
    vector: {
      drama: 0.52,
      history: 0.2,
      documentary: 0.2,
      tone: -0.3,
      intensity: 0.5,
      pacing: -0.4,
      popularity: -0.4,
    },
    adjective: 'acclaimed',
    mood: 'critically praised cinema and prestige storytelling',
    tmdbGenreIds: [18, 36, 99],
    representativeTmdbIds: [
      { tmdbId: 581734, mediaType: 'movie' }, // Nomadland
      { tmdbId: 278, mediaType: 'movie' },    // The Shawshank Redemption
    ],
  },
  // 12. History & War
  {
    id: 'history-war',
    name: 'History & War',
    description: 'Period pieces, historical epics, and war stories',
    emoji: '⚔️',
    vector: {
      history: 0.64,
      war: 0.52,
      drama: 0.46,
      tone: -0.3,
      intensity: 0.5,
      pacing: -0.5,
      era: 0.7,
    },
    adjective: 'epic',
    mood: 'historical epics and wartime drama',
    tmdbGenreIds: [36, 10752, 18],
    representativeTmdbIds: [
      { tmdbId: 857, mediaType: 'movie' },    // Saving Private Ryan
      { tmdbId: 374720, mediaType: 'movie' }, // Dunkirk
      { tmdbId: 16869, mediaType: 'movie' },  // Inglourious Basterds
    ],
  },
  // 13. Reality & Entertainment
  {
    id: 'reality-entertainment',
    name: 'Reality & Entertainment',
    description: 'Competition shows, reality TV, and entertainment',
    emoji: '📺',
    vector: {
      reality: 0.64,
      comedy: 0.2,
      tone: 0.5,
      pacing: 0.6,
      popularity: 0.6,
      intensity: -0.2,
    },
    adjective: 'entertaining',
    mood: 'competition shows and unscripted entertainment',
    tmdbGenreIds: [10764, 35],
    representativeTmdbIds: [
      { tmdbId: 37678, mediaType: 'tv' },  // The Voice
    ],
  },
  // 14. Cult & Indie
  {
    id: 'cult-indie',
    name: 'Cult & Indie',
    description: 'Off-beat, niche, and under-the-radar gems',
    emoji: '🎬',
    vector: {
      drama: 0.3,
      comedy: 0.2,
      tone: -0.2,
      popularity: -0.8,
      intensity: 0.2,
    },
    adjective: 'offbeat',
    mood: 'cult favourites and indie discoveries',
    tmdbGenreIds: [18, 35],
    representativeTmdbIds: [
      { tmdbId: 550, mediaType: 'movie' },  // Fight Club
      { tmdbId: 680, mediaType: 'movie' },  // Pulp Fiction
    ],
  },
  // 15. Family & Kids
  {
    id: 'family-kids',
    name: 'Family & Kids',
    description: 'Animated films, family adventures, and kid-friendly fun',
    emoji: '👨‍👩‍👧‍👦',
    vector: {
      family: 0.64,
      animation: 0.46,
      comedy: 0.3,
      adventure: 0.3,
      tone: 0.8,
      intensity: -0.6,
      pacing: 0.3,
    },
    adjective: 'family-friendly',
    mood: 'fun adventures for all ages',
    tmdbGenreIds: [10751, 16, 35, 12],
    representativeTmdbIds: [
      { tmdbId: 12, mediaType: 'movie' },     // Finding Nemo
      { tmdbId: 8587, mediaType: 'movie' },   // The Lion King
      { tmdbId: 277834, mediaType: 'movie' }, // Moana
      { tmdbId: 862, mediaType: 'movie' },    // Toy Story
    ],
  },
  // 16. Westerns & Frontier
  {
    id: 'westerns-frontier',
    name: 'Westerns & Frontier',
    description: 'Cowboys, outlaws, and rugged frontier tales',
    emoji: '🤠',
    vector: {
      western: 0.64,
      action: 0.4,
      adventure: 0.3,
      drama: 0.3,
      tone: -0.3,
      intensity: 0.5,
      pacing: 0.2,
      era: 0.5,
    },
    adjective: 'rugged',
    mood: 'frontier tales and outlaw drama',
    tmdbGenreIds: [37, 28, 12],
    representativeTmdbIds: [
      { tmdbId: 429, mediaType: 'movie' },    // The Good, the Bad and the Ugly
      { tmdbId: 68718, mediaType: 'movie' },  // Django Unchained
      { tmdbId: 281957, mediaType: 'movie' }, // The Revenant
      { tmdbId: 6977, mediaType: 'movie' },   // No Country for Old Men
    ],
  },
];

// ── Computation ──────────────────────────────────────────────────

/**
 * Average the partial vectors of selected clusters into a full 24D seed vector.
 *
 * For each dimension:
 * - Gather all non-undefined values from selected clusters
 * - If none → 0.0 (no opinion from any cluster)
 * - If one or more → arithmetic mean
 *
 * All values clamped to valid ranges (genres [0,1], meta [-1,1]).
 */
export function computeClusterSeedVector(selectedClusterIds: string[]): TasteVector {
  const clusters = selectedClusterIds
    .map(id => TASTE_CLUSTERS.find(c => c.id === id))
    .filter((c): c is TasteCluster => c != null);

  debug.info('Clusters', 'Computing seed vector', {
    selectedIds: selectedClusterIds,
    selectedNames: clusters.map(c => c.name),
    count: clusters.length,
  });

  const vector = createEmptyVector();

  for (const dim of ALL_DIMENSIONS) {
    const values = clusters
      .map(c => c.vector[dim])
      .filter((v): v is number => v !== undefined);

    if (values.length > 0) {
      vector[dim] = values.reduce((sum, v) => sum + v, 0) / values.length;
    }
    // else: stays 0.0 (from createEmptyVector)
  }

  const clamped = clampVector(vector);

  const nonZeroDims = Object.entries(clamped)
    .filter(([, v]) => (v as number) !== 0)
    .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
    .map(([k, v]) => `${k}:${(v as number).toFixed(3)}`);
  debug.info('Clusters', 'Seed vector computed', { nonZeroDims });

  return clamped;
}

/**
 * Derive TMDb genre IDs from cluster selections for homepage sections & browse.
 *
 * Extracts genre dimensions with signal ≥ 0.3 from the seed vector,
 * sorted by strength descending, capped at 8, mapped to TMDb IDs.
 *
 * Returns [] when no genre meets the threshold — caller should fall back
 * to DEFAULT_HOME_GENRES.
 */
export function deriveHomeGenres(selectedClusterIds: string[]): number[] {
  const seedVector = computeClusterSeedVector(selectedClusterIds);

  return [...GENRE_DIMENSIONS]
    .map(dim => ({ dim, value: seedVector[dim] }))
    .filter(({ value }) => value >= 0.3)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map(({ dim }) => GENRE_KEY_TO_TMDB[dim])
    .filter((id): id is number => id != null && id > 0);
}

/**
 * Extract the top N genre dimension keys from a cluster-derived seed vector.
 * Used by quiz pair selection to match genre-responsive pairs.
 */
export function getTopGenreKeysFromClusters(
  selectedClusterIds: string[],
  topN = 3,
): string[] {
  const seedVector = computeClusterSeedVector(selectedClusterIds);

  return [...GENRE_DIMENSIONS]
    .filter(dim => seedVector[dim] > 0)
    .sort((a, b) => seedVector[b] - seedVector[a])
    .slice(0, topN);
}
