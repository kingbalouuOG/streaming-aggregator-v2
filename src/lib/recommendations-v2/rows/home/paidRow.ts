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

/** Stream types that mean "you pay per title" — the row's whole remit. */
const PAID_STREAM_TYPES = ['rent', 'buy'] as const;

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
    // Rent/buy availability on any of the user's services. Over-fetch
    // ids (many titles carry several rent/buy rows — per quality tier,
    // per service) then dedup to distinct titles.
    const { data: saData } = await client
      .from('streaming_availability')
      .select('tmdb_id, media_type')
      .in('service_id', services)
      .in('stream_type', PAID_STREAM_TYPES)
      .limit(600);

    if (!saData || saData.length === 0) return [];

    // Strictly pay-ONLY (beta feedback 2026-07-11): a title that is also
    // watchable at no extra cost on the user's services — subscription or
    // free — is not "pay to watch" for them; suggesting a rental they
    // already have is worse than hiding it. `addon` deliberately does NOT
    // count as included: a channel add-on is another paywall. Keyed on
    // (media_type, tmdb_id) — tmdb ids collide across movies and TV.
    const candidateIds = [...new Set(saData.map((r) => r.tmdb_id))];
    const { data: includedData } = await client
      .from('streaming_availability')
      .select('tmdb_id, media_type')
      .in('service_id', services)
      .in('tmdb_id', candidateIds)
      .in('stream_type', ['subscription', 'free']);

    const includedKeys = new Set(
      (includedData ?? []).map((r) => `${r.media_type}-${r.tmdb_id}`),
    );
    const paidOnlyKeys = new Set(
      saData
        .map((r) => `${r.media_type}-${r.tmdb_id}`)
        .filter((key) => !includedKeys.has(key)),
    );
    if (paidOnlyKeys.size === 0) return [];

    const tmdbIds = [
      ...new Set(
        saData.filter((r) => paidOnlyKeys.has(`${r.media_type}-${r.tmdb_id}`)).map((r) => r.tmdb_id),
      ),
    ];

    // Newest-first by release date — rent/buy inventory is dominated by
    // recent releases, and release_date is reliably populated (unlike
    // available_since). NULLS LAST keeps undated back-catalogue titles
    // from crowding the head of the row.
    const { data: titleData } = await client
      .from('titles')
      .select(EXTENDED_TITLE_SELECT)
      .in('tmdb_id', tmdbIds)
      .order('release_date', { ascending: false, nullsFirst: false })
      .limit(limit * 4);

    if (!titleData) return [];

    const items: ContentItem[] = [];
    for (const row of titleData) {
      const typed = row as unknown as ExtendedTitleRow;
      const item = titleRowToContentItem(typed);
      if (!item.image) continue; // imageless cards look broken in a poster row
      if (excludeIds.has(item.id)) continue;
      // The titles query matches on tmdb_id alone; re-check the composite
      // key so the other media type sharing an id can't slip in.
      if (!paidOnlyKeys.has(item.id)) continue;
      items.push(item);
      if (items.length >= limit) break;
    }

    return items;
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
