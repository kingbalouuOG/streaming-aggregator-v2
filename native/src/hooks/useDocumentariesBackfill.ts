import { useQuery } from '@tanstack/react-query';

import {
  tmdbMovieToContentItem,
  tmdbTVToContentItem,
  type TMDbContentResult,
} from '@/lib/adapters/contentAdapter';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { DOCUMENTARY_GENRE_ID } from '@/lib/content/documentary';
import type { ContentItem, ServiceId } from '@/lib/types/content';

// The one targeted backfill (recommendation 2026-09-08-002 §1.3).
//
// Movies and TV each leave about half of every rail on New, comfortably
// above the thin-rail threshold. Documentaries will not: it is a genre,
// roughly 5–8% of a general pool, so it goes thin nearly everywhere. Rather
// than build a general "instant filter, backfill behind" hybrid for a case
// that only bites once, New fetches ONE extra rail — but only for
// Documentaries, and only after the chip is actually tapped.
//
// Two constraints this exists to respect:
//
//   - It must never run on page open, or Workstream B's cold-open number
//     regresses for everyone to serve one chip. Hence `enabled`.
//   - It must not touch `/v1/home` or its KV key (§0.3). This is a separate
//     TMDb discover call under its own React Query key, so the Home payload
//     and its 10-minute cache are untouched.
//
// `staleTime: Infinity` is the "cached for the session" in §1.3: tapping
// Documentaries → All → Documentaries refetches nothing.

interface DiscoverResponse {
  success?: boolean;
  data?: { results?: TMDbContentResult[] };
}

/** Interleave the two halves 1:1 so the rail is not all films then all series. */
function interleave(movies: ContentItem[], tv: ContentItem[]): ContentItem[] {
  const out: ContentItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(movies.length, tv.length); i++) {
    for (const item of [movies[i], tv[i]]) {
      // Imageless cards look broken in a poster rail, and the dedupe guards
      // the (rare) case of a title appearing on both endpoints.
      if (item && item.image && !seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
  }
  return out;
}

async function fetchDocumentaries(services: ServiceId[]): Promise<ContentItem[]> {
  const params: Record<string, unknown> = {
    watch_region: 'GB',
    sort_by: 'popularity.desc',
    with_genres: String(DOCUMENTARY_GENRE_ID),
  };
  // Scope to the user's stack — an unreachable documentary is worse than a
  // short rail. Genre 99 is valid on both TMDb endpoints, so no sanitising.
  const providerIds = serviceIdsToProviderIds(services);
  if (providerIds.length) params.with_watch_providers = providerIds.join('|');

  const [movies, tv] = await Promise.all([
    discoverMovies(params) as Promise<DiscoverResponse>,
    discoverTV(params) as Promise<DiscoverResponse>,
  ]);

  return interleave(
    (movies.data?.results ?? []).map(tmdbMovieToContentItem),
    (tv.data?.results ?? []).map(tmdbTVToContentItem),
  );
}

/**
 * "Documentaries on your services" — the extra rail New shows beneath the
 * filtered survivors once the Documentaries chip is tapped.
 *
 * @param services the user's stack
 * @param enabled  true only while Documentaries is the active chip
 */
export function useDocumentariesBackfill(services: ServiceId[], enabled: boolean) {
  return useQuery({
    queryKey: ['native', 'home', 'docsBackfill', services.join(',')],
    queryFn: () => fetchDocumentaries(services),
    enabled: enabled && services.length > 0,
    staleTime: Infinity,
  });
}
