/**
 * Genre Spotlight — rotating weekly row.
 *
 * One genre per week, selected by week_number % cluster_count hash (deterministic,
 * no editorial overlay needed). The 16 taste clusters from Phase 3 serve as the
 * genre pool. Within the row: trending + recently added titles from user's services
 * within the selected genre cluster.
 *
 * Rationale for weekly: users don't exhaust a genre's catalogue daily.
 * Editorial overlay can be layered later without structural changes.
 */

import { TASTE_CLUSTERS } from '@/lib/taste-v2/tasteClusters';
import { supabase } from '@/lib/supabase';
import { titleRowToContentItem } from '../../titleAdapter';
import { EXTENDED_TITLE_SELECT } from '../../types';
import type { ExtendedTitleRow } from '../../types';
import type { ContentItem } from '@/components/ContentCard';

/** Get this week's spotlight cluster */
export function getWeeklyCluster(): typeof TASTE_CLUSTERS[number] {
  const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const clusterIndex = weekNumber % TASTE_CLUSTERS.length;
  return TASTE_CLUSTERS[clusterIndex];
}

/**
 * Fetch genre spotlight titles for the Home surface.
 * Returns trending + recently added titles matching the weekly cluster's genre IDs,
 * filtered to user's available services.
 */
export async function fetchGenreSpotlight(
  availableTmdbIds: Set<number>,
  limit: number = 15,
): Promise<{ clusterName: string; emoji: string; items: ContentItem[] }> {
  const cluster = getWeeklyCluster();
  const genreIds = cluster.tmdbGenreIds;

  if (genreIds.length === 0) {
    return { clusterName: cluster.name, emoji: cluster.emoji, items: [] };
  }

  try {
    // Query titles with genre overlap, ordered by popularity
    const { data, error } = await supabase
      .from('titles' as any)
      .select(EXTENDED_TITLE_SELECT)
      .overlaps('genre_ids', genreIds)
      .order('popularity', { ascending: false })
      .limit(80); // overfetch for availability filtering

    if (error || !data) {
      return { clusterName: cluster.name, emoji: cluster.emoji, items: [] };
    }

    const items: ContentItem[] = [];
    for (const row of data as any[]) {
      const typed = row as ExtendedTitleRow;

      // Availability filter
      if (availableTmdbIds.size > 0 && !availableTmdbIds.has(typed.tmdb_id)) continue;

      items.push(titleRowToContentItem(typed));
      if (items.length >= limit) break;
    }

    return { clusterName: cluster.name, emoji: cluster.emoji, items };
  } catch {
    return { clusterName: cluster.name, emoji: cluster.emoji, items: [] };
  }
}
