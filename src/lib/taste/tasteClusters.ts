/**
 * Taste Clusters
 *
 * 14 taste archetypes that replace raw genre selection in onboarding.
 * Each cluster maps to a partial 25D vector encoding genre affinities
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
 */
export const TASTE_CLUSTERS: TasteCluster[] = [
  // 1. Feel-Good & Funny
  {
    id: 'feel-good-funny',
    name: 'Feel-Good & Funny',
    description: 'Light comedies, sitcoms, and uplifting stories',
    emoji: '😍',
    vector: {
      comedy: 0.9,
      drama: 0.2,
      tone: 0.8,
      intensity: -0.4,
      pacing: 0.3,
    },
  },
  // 2. Action & Adrenaline
  {
    id: 'action-adrenaline',
    name: 'Action & Adrenaline',
    description: 'Explosions, fights, and high-stakes chases',
    emoji: '🚀',
    vector: {
      action: 0.9,
      adventure: 0.5,
      thriller: 0.3,
      intensity: 0.75,
      pacing: 0.9,
      tone: -0.2,
    },
  },
  // 3. Dark Thrillers
  {
    id: 'dark-thrillers',
    name: 'Dark Thrillers',
    description: 'Tense, gritty crime and suspense',
    emoji: '🔪',
    vector: {
      thriller: 0.9,
      crime: 0.6,
      mystery: 0.3,
      tone: -0.8,
      intensity: 0.7,
      pacing: 0.7,
    },
  },
  // 4. Rom-Coms & Love Stories
  {
    id: 'rom-coms-love-stories',
    name: 'Rom-Coms & Love Stories',
    description: 'Romantic comedies and sweeping romances',
    emoji: '💕',
    vector: {
      romance: 0.9,
      comedy: 0.6,
      drama: 0.3,
      tone: 0.7,
      intensity: -0.3,
    },
  },
  // 5. Epic Sci-Fi & Fantasy
  {
    id: 'epic-scifi-fantasy',
    name: 'Epic Sci-Fi & Fantasy',
    description: 'Grand worlds, speculative stories, and mythic adventures',
    emoji: '🔮',
    vector: {
      scifi: 0.8,
      fantasy: 0.8,
      adventure: 0.5,
      intensity: 0.2,
      pacing: -0.2,
      era: -0.2,
    },
  },
  // 6. Horror & Supernatural
  {
    id: 'horror-supernatural',
    name: 'Horror & Supernatural',
    description: 'Scary, creepy, and unsettling',
    emoji: '👻',
    vector: {
      horror: 0.9,
      thriller: 0.4,
      mystery: 0.2,
      tone: -0.9,
      intensity: 0.75,
      pacing: 0.2,
    },
  },
  // 7. Mind-Bending Mysteries
  {
    id: 'mind-bending-mysteries',
    name: 'Mind-Bending Mysteries',
    description: 'Psychological puzzles and twist-driven stories',
    emoji: '🧠',
    vector: {
      mystery: 0.9,
      thriller: 0.5,
      scifi: 0.2,
      tone: -0.5,
      intensity: 0.5,
      pacing: -0.3,
    },
  },
  // 8. Heartfelt Drama
  {
    id: 'heartfelt-drama',
    name: 'Heartfelt Drama',
    description: 'Character-driven emotional stories',
    emoji: '💚',
    vector: {
      drama: 0.9,
      romance: 0.2,
      tone: 0.3,
      intensity: 0.2,
      pacing: -0.4,
    },
  },
  // 9. True Crime & Real Stories
  {
    id: 'true-crime-real-stories',
    name: 'True Crime & Real Stories',
    description: 'Documentaries, docuseries, and based-on-true-events',
    emoji: '📰',
    vector: {
      documentary: 0.9,
      crime: 0.5,
      history: 0.3,
      tone: -0.5,
      intensity: 0.5,
      pacing: -0.2,
    },
  },
  // 10. Anime & Animation
  {
    id: 'anime-animation',
    name: 'Anime & Animation',
    description: 'Anime, animated series, and animated films',
    emoji: '🍥',
    vector: {
      animation: 0.9,
      action: 0.3,
      fantasy: 0.3,
      intensity: 0.3,
      pacing: 0.2,
    },
  },
  // 11. Prestige & Award-Winners
  {
    id: 'prestige-award-winners',
    name: 'Prestige & Award-Winners',
    description: 'Critically acclaimed, Oscar- and BAFTA-calibre',
    emoji: '🏆',
    vector: {
      drama: 0.7,
      history: 0.2,
      documentary: 0.2,
      tone: -0.3,
      intensity: 0.5,
      pacing: -0.4,
      popularity: -0.4,
    },
  },
  // 12. History & War
  {
    id: 'history-war',
    name: 'History & War',
    description: 'Period pieces, historical epics, and war stories',
    emoji: '⚔️',
    vector: {
      history: 0.9,
      war: 0.7,
      drama: 0.6,
      tone: -0.3,
      intensity: 0.5,
      pacing: -0.5,
      era: 0.7,
    },
  },
  // 13. Reality & Entertainment
  {
    id: 'reality-entertainment',
    name: 'Reality & Entertainment',
    description: 'Competition shows, reality TV, and entertainment',
    emoji: '📺',
    vector: {
      reality: 0.9,
      comedy: 0.2,
      tone: 0.5,
      pacing: 0.6,
      popularity: 0.6,
      intensity: -0.2,
    },
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
  },
];

// ── Computation ──────────────────────────────────────────────────

/**
 * Average the partial vectors of selected clusters into a full 25D seed vector.
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
