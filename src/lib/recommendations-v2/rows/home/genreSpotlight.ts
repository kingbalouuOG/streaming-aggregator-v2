/**
 * Genre Spotlight — rotating row chain on the Home surface.
 *
 * Primary spotlight loads with the rest of Home; further clusters
 * mount lazily as the user scrolls. Cluster ordering is preference-
 * weighted: the user's onboarding-selected clusters come first, then
 * the rest of the catalogue rotates by week. Within each cluster we
 * use only the headline (most-specific) genre to avoid drama-tagged
 * or animation-tagged titles polluting unrelated clusters.
 */

import { TASTE_CLUSTERS, type TasteCluster } from '@/lib/taste-v2/tasteClusters';
import { supabase } from '@/lib/supabase';
import { titleRowToContentItem } from '../../titleAdapter';
import { EXTENDED_TITLE_SELECT } from '../../types';
import type { ExtendedTitleRow } from '../../types';
import type { ContentItem } from '@/components/ContentCard';

/**
 * Drama (18) and Comedy (35) are baseline TMDb tags applied to most
 * TV/scripted content. They appear in cluster `tmdbGenreIds` for
 * onboarding vector seeding (see tasteClusters.ts comment block) but
 * using them in the Genre Spotlight query floods results with
 * unrelated drama-tagged titles. Drop them when the cluster has a
 * specific primary genre to lean on.
 */
const SPOTLIGHT_BROAD_GENRES = new Set<number>([18, 35]);

/**
 * Per-cluster "required genres" overrides for clusters whose name is
 * narrower than the headline genre alone supports. Each cluster's
 * spotlight will require ALL listed genre IDs to be present in a
 * title's genre_ids array. Without these, single-headline filtering
 * surfaces semantically off-genre titles:
 *
 *   - true-crime-real-stories: headline = 99 (Documentary) alone pulls
 *     in Drive to Survive (F1), cooking docs, nature docs. Add 80
 *     (Crime) to scope to true-crime semantics.
 *   - rom-coms-love-stories: headline = 10749 (Romance) alone pulls in
 *     Dracula (TMDb tags it Romance + Horror for the gothic-romance
 *     angle). Add 35 (Comedy) to scope to rom-com semantics.
 *
 * Add more clusters here when telemetry surfaces semantic drift.
 */
const SPOTLIGHT_REQUIRED_GENRES: Record<string, number[]> = {
  'true-crime-real-stories': [99, 80],
  'rom-coms-love-stories': [10749, 35],
};

/**
 * Order the 16 clusters so the user's selected clusters come first,
 * then the rest. Within each segment a week-based rotation keeps the
 * order fresh week-to-week. The result is the lazy-load chain order:
 * index 0 is the primary spotlight, index 1 is the next loaded, etc.
 */
export function getOrderedClusters(selectedClusterIds: string[]): TasteCluster[] {
  const selectedSet = new Set(selectedClusterIds);
  const selected = TASTE_CLUSTERS.filter((c) => selectedSet.has(c.id));
  const remaining = TASTE_CLUSTERS.filter((c) => !selectedSet.has(c.id));

  // Week-based rotation within each segment so the row feels different
  // week-to-week without the ordering being chaotic.
  const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const rotate = <T>(arr: T[], n: number): T[] => {
    if (arr.length === 0) return arr;
    const k = ((n % arr.length) + arr.length) % arr.length;
    return [...arr.slice(k), ...arr.slice(0, k)];
  };

  return [...rotate(selected, weekNumber), ...rotate(remaining, weekNumber)];
}

/**
 * Get the spotlight cluster at a given offset in the user-preference-
 * weighted order. `offset = 0` is the primary spotlight (typically a
 * user-selected cluster); `offset = 1` is the next, etc.
 *
 * Backwards-compat: if no `selectedClusterIds` are passed, falls back
 * to pure week-modulo (the old behaviour) so callers that don't have
 * profile data yet still work.
 */
export function getWeeklyCluster(
  offset: number = 0,
  selectedClusterIds: string[] = [],
): TasteCluster {
  if (selectedClusterIds.length === 0) {
    const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const clusterIndex = (weekNumber + offset) % TASTE_CLUSTERS.length;
    return TASTE_CLUSTERS[clusterIndex];
  }
  const ordered = getOrderedClusters(selectedClusterIds);
  return ordered[offset % ordered.length];
}

/**
 * Compute the headline (most-specific) genre for a cluster. The cluster
 * `tmdbGenreIds` array can include broad seeding genres that would
 * pollute the spotlight query — Family & Kids has Animation in there
 * because the cluster covers animated family films, but using it in
 * the filter pulls in unrelated anime (which is its own cluster). We
 * take the FIRST non-broad genre and use only that.
 */
function getHeadlineGenre(cluster: TasteCluster): number | null {
  const tightened = cluster.tmdbGenreIds.filter(
    (g) => !SPOTLIGHT_BROAD_GENRES.has(g),
  );
  return tightened[0] ?? cluster.tmdbGenreIds[0] ?? null;
}

/**
 * Fetch genre spotlight titles for the Home surface.
 * Returns trending titles matching the cluster's headline genre,
 * filtered to user's available services.
 */
export async function fetchGenreSpotlight(
  availableTmdbIds: Set<number>,
  limit: number = 15,
  offset: number = 0,
  selectedClusterIds: string[] = [],
  /**
   * Cross-row dedup. Pass tmdb-id-form ContentItem.id strings already
   * shown elsewhere on Home (other genre spotlights, per-service charts).
   * Same title appearing in two adjacent clusters is the most visible
   * dedup failure ("The Goldbergs in two consecutive sections").
   */
  excludeIds: Set<string> = new Set(),
): Promise<{ clusterName: string; items: ContentItem[] }> {
  const cluster = getWeeklyCluster(offset, selectedClusterIds);
  const headlineGenre = getHeadlineGenre(cluster);

  if (headlineGenre == null) {
    return { clusterName: cluster.name, items: [] };
  }

  // Some clusters require multiple genres to scope correctly (see
  // SPOTLIGHT_REQUIRED_GENRES doc). When the cluster has an override,
  // `.contains()` enforces all required genres in the SQL query;
  // otherwise we fall back to single-genre `.overlaps()`.
  const requiredGenres = SPOTLIGHT_REQUIRED_GENRES[cluster.id];

  try {
    let query = supabase
      .from('titles')
      .select(EXTENDED_TITLE_SELECT);
    query = requiredGenres
      ? query.contains('genre_ids', requiredGenres)
      : query.overlaps('genre_ids', [headlineGenre]);
    const { data, error } = await query
      .order('popularity', { ascending: false })
      .limit(limit * 8);

    if (error || !data) {
      return { clusterName: cluster.name, items: [] };
    }

    const items: ContentItem[] = [];
    for (const row of data) {
      const typed = row as unknown as ExtendedTitleRow;

      if (availableTmdbIds.size > 0 && !availableTmdbIds.has(typed.tmdb_id)) continue;
      const item = titleRowToContentItem(typed);
      if (excludeIds.has(item.id)) continue;

      items.push(item);
      if (items.length >= limit) break;
    }

    return { clusterName: cluster.name, items };
  } catch {
    return { clusterName: cluster.name, items: [] };
  }
}
