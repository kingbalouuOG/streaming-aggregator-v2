/**
 * New to rent or buy — the Home / For You "paid titles" row.
 *
 * Beta feedback (2026-07-09): the per-service rows only ever list
 * subscription/free titles now (see perServiceChart.ts), so genuinely
 * new rent/buy releases — often the freshest content on a service, and
 * the whole point of a store like Prime Video's — had nowhere to
 * surface. This row is the deliberate, clearly-labelled home for them:
 * "New to rent or buy" tells the user up front that tapping in costs
 * money, so the rent/buy exclusion from the service rows doesn't hide
 * content, it relocates it honestly.
 *
 * Content: newest rent/buy titles available on ANY of the user's
 * selected services, newest release first (rent/buy inventory skews to
 * new releases — release_date is the reliable freshness signal;
 * available_since is only sparsely populated by the sync pipeline).
 *
 * Two entry points, same shape as the other home rows:
 *   - fetchPaidTitles(services)          — client singleton (native Home).
 *   - fetchPaidTitlesScoped(client, ...) — explicit client (videx-api
 *     Worker For You render). Reads only the public content-cache tables
 *     (streaming_availability + titles), so no UserScope is needed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { titleRowToContentItem } from '../../titleAdapter';
import { EXTENDED_TITLE_SELECT } from '../../types';
import type { ExtendedTitleRow } from '../../types';
import type { ContentItem } from '@/lib/types/content';

/** Default number of titles in the row. */
const DEFAULT_LIMIT = 18;

/**
 * Scoped builder — pass the client explicitly (Worker uses the
 * service-role client). `services` are Videx service ids; an empty list
 * yields an empty row (no services = nothing to price up).
 */
export async function fetchPaidTitlesScoped(
  client: SupabaseClient,
  services: string[],
  limit: number = DEFAULT_LIMIT,
  /** Cross-row dedup: ContentItem.id strings already shown elsewhere. */
  excludeIds: Set<string> = new Set(),
): Promise<ContentItem[]> {
  if (services.length === 0) return [];

  try {
    // Strictly pay-ONLY, resolved by ONE SQL anti-join (migration 064,
    // pre-launch review 2026-07-12). The previous two-query TS shape had
    // two defects: the exclusion query silently truncated at PostgREST's
    // 1000-row cap (re-admitting subscription-included titles), and the
    // candidate query took an UNORDERED limit over ~40K rent/buy rows,
    // so "newest" sorted an arbitrary sample. The RPC returns titles with
    // a rent/buy row and NO subscription/free row on the user's services,
    // release_date DESC ('addon' counts as paid — it's another paywall).
    const { data: paidData } = await client.rpc('paid_only_titles', {
      p_services: services,
      // Headroom: imageless titles and cross-row dedup drops below.
      p_limit: limit * 3,
    });

    const paidRows = (paidData ?? []) as { tmdb_id: number; media_type: string }[];
    if (paidRows.length === 0) return [];

    // RPC order is the row order; keep it through the unordered metadata
    // fetch. Keyed on (media_type, tmdb_id) — tmdb ids collide across
    // movies and TV.
    const rank = new Map(paidRows.map((r, i) => [`${r.media_type}-${r.tmdb_id}`, i]));
    const tmdbIds = [...new Set(paidRows.map((r) => r.tmdb_id))];

    const { data: titleData } = await client
      .from('titles')
      .select(EXTENDED_TITLE_SELECT)
      .in('tmdb_id', tmdbIds);

    if (!titleData) return [];

    const items: ContentItem[] = [];
    for (const row of titleData) {
      const typed = row as unknown as ExtendedTitleRow;
      const item = titleRowToContentItem(typed);
      if (!item.image) continue; // imageless cards look broken in a poster row
      if (excludeIds.has(item.id)) continue;
      // The titles query matches on tmdb_id alone; the rank map re-checks
      // the composite key so the other media type sharing an id can't
      // slip in.
      if (!rank.has(item.id)) continue;
      items.push(item);
    }

    items.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Client-singleton builder for the native Home feed.
 */
export function fetchPaidTitles(
  services: string[],
  limit: number = DEFAULT_LIMIT,
  excludeIds: Set<string> = new Set(),
): Promise<ContentItem[]> {
  return fetchPaidTitlesScoped(supabase, services, limit, excludeIds);
}
