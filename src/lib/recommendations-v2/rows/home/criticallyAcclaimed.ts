/**
 * Critically Acclaimed New Releases — GATED row.
 *
 * Gated behind CRITICALLY_ACCLAIMED_ROW_ENABLED flag in weights.ts.
 * Ships disabled until OMDB coverage >= 80% of titles released in last 90 days.
 *
 * Selection: titles released in last 90 days with RT >= 80%, IMDb >= 7.5,
 * vote_count >= 50, available on user's services.
 */

import { supabase } from '@/lib/supabase';
import { titleRowToContentItem } from '../../titleAdapter';
import { CRITICALLY_ACCLAIMED_ROW_ENABLED, parseRtScore } from '../../weights';
import { EXTENDED_TITLE_SELECT } from '../../types';
import type { ExtendedTitleRow } from '../../types';
import type { ContentItem } from '@/components/ContentCard';

/**
 * Fetch critically acclaimed titles for the Home surface.
 * Returns empty array if the feature flag is disabled.
 */
export async function fetchCriticallyAcclaimed(
  availableTmdbIds: Set<number>,
  limit: number = 15,
): Promise<ContentItem[]> {
  if (!CRITICALLY_ACCLAIMED_ROW_ENABLED) return [];

  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('titles')
      .select(EXTENDED_TITLE_SELECT)
      .gte('release_date', ninetyDaysAgo)
      .gte('imdb_rating', 7.5)
      .gte('vote_count', 50)
      .order('vote_average', { ascending: false })
      .limit(50); // overfetch for RT + availability filtering

    if (error || !data) return [];

    const items: ContentItem[] = [];
    for (const row of data) {
      const typed = row as unknown as ExtendedTitleRow;

      // Availability filter
      if (availableTmdbIds.size > 0 && !availableTmdbIds.has(typed.tmdb_id)) continue;

      // RT score filter (parse "93%" string → 0.93, require >= 0.80)
      const rtScore = parseRtScore(typed.rt_score);
      if (rtScore < 0.80) continue;

      items.push(titleRowToContentItem(typed));
      if (items.length >= limit) break;
    }

    return items;
  } catch {
    return [];
  }
}
