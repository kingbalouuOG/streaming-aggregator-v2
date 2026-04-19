/**
 * Per-Service Charts — one row per user's most-used service (up to 3).
 *
 * Ordering: services ranked by deep_link_click count DESC from user_interactions.
 * Fallback for new users: selected_services order (roughly UK market size from onboarding).
 *
 * Within each row: popular titles on that specific service.
 */

import { supabase } from '@/lib/supabase';
import { getAuthUserId, isSupabaseActive } from '@/lib/storage';
import { titleRowToContentItem } from '../../titleAdapter';
import { EXTENDED_TITLE_SELECT } from '../../types';
import type { ExtendedTitleRow } from '../../types';
import type { ContentItem } from '@/components/ContentCard';

export interface PerServiceChartRow {
  serviceId: string;
  serviceName: string;
  items: ContentItem[];
}

const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  netflix: 'Netflix',
  prime: 'Prime Video',
  disney: 'Disney+',
  apple: 'Apple TV+',
  now: 'NOW',
  bbc: 'BBC iPlayer',
  itvx: 'ITVX',
  channel4: 'Channel 4',
  paramount: 'Paramount+',
  skygo: 'Sky Go',
};

/**
 * Fetch per-service chart rows for the Home surface.
 * Returns up to 3 rows, one per most-used service.
 */
export async function fetchPerServiceCharts(
  userServiceIds: string[],
  limit: number = 3,
): Promise<PerServiceChartRow[]> {
  if (userServiceIds.length === 0) return [];

  // Determine service ordering
  const orderedServices = await getServiceOrder(userServiceIds);
  const topServices = orderedServices.slice(0, limit);

  // Fetch popular titles per service in parallel
  const rows = await Promise.all(
    topServices.map(serviceId => fetchServiceRow(serviceId)),
  );

  return rows.filter(row => row.items.length > 0);
}

async function getServiceOrder(userServiceIds: string[]): Promise<string[]> {
  if (!isSupabaseActive()) return userServiceIds;
  const userId = getAuthUserId();
  if (!userId) return userServiceIds;

  try {
    const { data } = await supabase
      .from('user_interactions' as any)
      .select('metadata')
      .eq('user_id', userId)
      .eq('event_type', 'deep_link_click')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!data || data.length === 0) return userServiceIds;

    // Count clicks per service
    const counts = new Map<string, number>();
    for (const row of data as any[]) {
      const sid = row.metadata?.service_id as string | undefined;
      if (sid && userServiceIds.includes(sid)) {
        counts.set(sid, (counts.get(sid) ?? 0) + 1);
      }
    }

    if (counts.size === 0) return userServiceIds;

    // Sort by count DESC, then append services with no clicks
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([sid]) => sid);
    const remaining = userServiceIds.filter(sid => !counts.has(sid));
    return [...sorted, ...remaining];
  } catch {
    return userServiceIds;
  }
}

async function fetchServiceRow(serviceId: string): Promise<PerServiceChartRow> {
  const serviceName = SERVICE_DISPLAY_NAMES[serviceId] ?? serviceId;

  try {
    // Get popular titles available on this specific service
    const { data: saData } = await supabase
      .from('streaming_availability' as any)
      .select('tmdb_id')
      .eq('service_id', serviceId)
      .eq('stream_type', 'subscription')
      .limit(200);

    if (!saData || saData.length === 0) {
      return { serviceId, serviceName, items: [] };
    }

    const tmdbIds = [...new Set((saData as any[]).map((r: any) => r.tmdb_id as number))];

    const { data: titleData } = await supabase
      .from('titles' as any)
      .select(EXTENDED_TITLE_SELECT)
      .in('tmdb_id', tmdbIds)
      .order('popularity', { ascending: false })
      .limit(15);

    if (!titleData) return { serviceId, serviceName, items: [] };

    const items = (titleData as any[]).map((row: any) =>
      titleRowToContentItem(row as ExtendedTitleRow),
    );

    return { serviceId, serviceName, items };
  } catch {
    return { serviceId, serviceName, items: [] };
  }
}
