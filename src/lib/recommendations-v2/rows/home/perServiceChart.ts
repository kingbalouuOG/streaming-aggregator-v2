/**
 * Per-Service Charts — one row per user's most-used service (up to 3).
 *
 * Ordering: services ranked by deep_link_click count DESC from user_interactions.
 * Fallback for new users: selected_services order (roughly UK market size from onboarding).
 *
 * Within each row: popular titles on that specific service.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { UserScope } from '@/lib/server/userScope';
import { getAuthUserId, isSupabaseActive } from '@/lib/storage';
import { titleRowToContentItem } from '../../titleAdapter';
import { EXTENDED_TITLE_SELECT } from '../../types';
import type { ExtendedTitleRow } from '../../types';
import type { ContentItem } from '@/lib/types/content';

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
/**
 * B5 server variant. `titles` / `streaming_availability` are public
 * content-cache tables so they take an explicit client, but the
 * click-ordering read hits `user_interactions`, which is user-owned and
 * must go through UserScope. Hence both, unlike fetchPaidTitlesScoped.
 */
export async function fetchPerServiceChartsScoped(
  client: SupabaseClient,
  scope: UserScope,
  userServiceIds: string[],
  limit?: number,
): Promise<PerServiceChartRow[]> {
  if (userServiceIds.length === 0) return [];

  const orderedServices = await getServiceOrderScoped(scope, userServiceIds);
  const topServices = limit != null ? orderedServices.slice(0, limit) : orderedServices;

  const rows = await Promise.all(
    topServices.map((serviceId) => fetchServiceRow(serviceId, client)),
  );

  return rows.filter((row) => row.items.length > 0);
}

/** Click-ordering via UserScope — same shape as getServiceOrder, but the
 *  user_id filter is applied by the scope rather than by hand. */
async function getServiceOrderScoped(
  scope: UserScope,
  userServiceIds: string[],
): Promise<string[]> {
  try {
    const { data } = await scope
      .select('user_interactions', 'metadata')
      .eq('event_type', 'deep_link_click')
      .order('created_at', { ascending: false })
      .limit(200);

    return orderServicesByClicks(
      (data ?? []) as { metadata: unknown }[],
      userServiceIds,
    );
  } catch {
    return userServiceIds;
  }
}

/** Shared by both paths so the ordering rule cannot drift between them. */
function orderServicesByClicks(
  rows: { metadata: unknown }[],
  userServiceIds: string[],
): string[] {
  if (rows.length === 0) return userServiceIds;

  const counts = new Map<string, number>();
  for (const row of rows) {
    const meta = row.metadata as { service_id?: string } | null;
    const sid = meta?.service_id;
    if (sid && userServiceIds.includes(sid)) {
      counts.set(sid, (counts.get(sid) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return userServiceIds;

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([sid]) => sid);
  const remaining = userServiceIds.filter((sid) => !counts.has(sid));
  return [...sorted, ...remaining];
}

export async function fetchPerServiceCharts(
  userServiceIds: string[],
  // Caller may cap; default is unlimited (one row per picked service that
  // has inventory). Joe's feedback: BBC / Channel 4 / Sky Go are picked
  // but didn't surface — the prior limit=3 was dropping them, and the
  // subscription-only filter inside fetchServiceRow was suppressing
  // free-tier services entirely.
  limit?: number,
): Promise<PerServiceChartRow[]> {
  if (userServiceIds.length === 0) return [];

  const orderedServices = await getServiceOrder(userServiceIds);
  const topServices = limit != null ? orderedServices.slice(0, limit) : orderedServices;

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
      .from('user_interactions')
      .select('metadata')
      .eq('user_id', userId)
      .eq('event_type', 'deep_link_click')
      .order('created_at', { ascending: false })
      .limit(200);

    return orderServicesByClicks((data ?? []) as { metadata: unknown }[], userServiceIds);
  } catch {
    return userServiceIds;
  }
}

/**
 * Recency factor for the Per-Service hybrid score. Skews the row
 * toward fresher content without dropping evergreen popular titles
 * entirely — Joe's feedback was that pure popularity surfaced things
 * like Law & Order: SVU (1999) on Sky Go, technically correct but
 * felt off for a "Popular on X" row.
 *
 * Returns a multiplier in [0.25, 1.0] applied to TMDb popularity:
 *   release within 2 years → 1.0  (current)
 *   3-5 years              → 0.85
 *   6-10 years             → 0.65
 *   11-20 years            → 0.45
 *   older                  → 0.25
 *   unknown release_year   → 0.50  (no data, middle weight)
 */
function recencyFactor(releaseYear: number | null): number {
  if (releaseYear == null) return 0.50;
  const age = new Date().getFullYear() - releaseYear;
  if (age <= 2) return 1.0;
  if (age <= 5) return 0.85;
  if (age <= 10) return 0.65;
  if (age <= 20) return 0.45;
  return 0.25;
}

async function fetchServiceRow(
  serviceId: string,
  db: SupabaseClient = supabase,
): Promise<PerServiceChartRow> {
  const serviceName = SERVICE_DISPLAY_NAMES[serviceId] ?? serviceId;

  try {
    // Only titles the user can watch WITHOUT paying per title on this
    // service — stream_type 'subscription' or 'free'. Beta feedback
    // (2026-07-09): a title whose only availability on e.g. Apple TV was
    // rent/buy still appeared in the "Popular on Apple TV+" row, so the
    // user tapped in expecting it to be included and hit a paywall.
    //   - 'rent'/'buy' are excluded here and relocated to the dedicated
    //     "New to rent or buy" row (paidRow.ts).
    //   - 'addon' is ALSO excluded: an add-on channel (e.g. a premium
    //     tier bolted onto a base service) is a separate paid entitlement
    //     the user may not hold, so it carries the same "surprise
    //     paywall" risk as rent/buy. Free-tier UK broadcasters (BBC /
    //     Channel 4 / Sky Go) surface via 'free', not 'addon', so this
    //     doesn't re-suppress them.
    const { data: saData } = await db
      .from('streaming_availability')
      .select('tmdb_id')
      .eq('service_id', serviceId)
      .in('stream_type', ['subscription', 'free'])
      .limit(200);

    if (!saData || saData.length === 0) {
      return { serviceId, serviceName, items: [] };
    }

    const tmdbIds = [...new Set(saData.map((r) => r.tmdb_id))];

    // Over-fetch by popularity DESC, then re-rank by hybrid score
    // (popularity × recencyFactor) and take top 15. The over-fetch is
    // 60 (4× target) so the recency re-rank has enough headroom to
    // promote newer content over very-popular-but-old titles.
    const { data: titleData } = await db
      .from('titles')
      .select(EXTENDED_TITLE_SELECT)
      .in('tmdb_id', tmdbIds)
      .order('popularity', { ascending: false })
      .limit(60);

    if (!titleData) return { serviceId, serviceName, items: [] };

    const ranked = titleData
      .map((row) => {
        const typed = row as unknown as ExtendedTitleRow;
        const pop = typed.popularity ?? 0;
        const score = pop * recencyFactor(typed.release_year);
        return { typed, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    const items = ranked.map(({ typed }) => titleRowToContentItem(typed));

    return { serviceId, serviceName, items };
  } catch {
    return { serviceId, serviceName, items: [] };
  }
}
