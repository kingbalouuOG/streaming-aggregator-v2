import { useQuery } from '@tanstack/react-query';

import { buildDetailData, type DetailData } from '@/lib/adapters/detailAdapter';
import {
  tmdbMovieToContentItem,
  tmdbTVToContentItem,
  type TMDbContentResult,
} from '@/lib/adapters/contentAdapter';
import { getStreamingLinks } from '@/lib/api/supabaseContent';
import { getSimilarMovies, getSimilarTV } from '@/lib/api/tmdb';
import { fetchMergedTitle } from '@/lib/api/videxApi';
import type { ContentItem } from '@/lib/types/content';

// Native detail data — re-orchestrates the SAME shared lib the web
// useContentDetail uses (fetchMergedTitle + getStreamingLinks +
// buildDetailData). Differences from web, all deferred to later work:
//  - "More like this" uses TMDb similar mapped straight to ContentItems;
//    the embedding/taste-vector re-scoring (needs the pgvector batch
//    query + taste profile) lands when For You goes native (W5/W6).
// Dwell + detail_view instrumentation is handled by DetailEngagement,
// which the detail route mounts alongside this hook's data.

export interface ContentDetail {
  detail: DetailData;
  similar: ContentItem[];
}

function parseId(contentItemId: string): { mediaType: 'movie' | 'tv'; tmdbId: number } | null {
  const [type, idStr] = contentItemId.split('-');
  const tmdbId = parseInt(idStr, 10);
  if ((type !== 'movie' && type !== 'tv') || Number.isNaN(tmdbId)) return null;
  return { mediaType: type, tmdbId };
}

async function fetchContentDetail(
  contentItemId: string,
  userPlatformIds?: number[],
): Promise<ContentDetail> {
  const parsed = parseId(contentItemId);
  if (!parsed) throw new Error('Invalid content ID');
  const { mediaType, tmdbId } = parsed;

  // Merged title + streaming links fire concurrently (the ENG-era win).
  const [merged, links] = await Promise.all([
    fetchMergedTitle(mediaType, tmdbId),
    getStreamingLinks(tmdbId, mediaType).catch(() => []),
  ]);

  if (!merged.success || !merged.data) {
    throw new Error(merged.error || 'Content not found');
  }

  const detail = buildDetailData(
    merged.data.tmdb,
    mediaType,
    merged.data.ratings ?? undefined,
    links,
    userPlatformIds,
  );

  // More like this — TMDb similar, mapped to ContentItems (no embedding
  // re-score yet; see header note).
  let similar: ContentItem[] = [];
  try {
    const fn = mediaType === 'movie' ? getSimilarMovies : getSimilarTV;
    const res = await fn(tmdbId);
    if (res.success) {
      const results: TMDbContentResult[] = res.data?.results ?? [];
      const toItem = mediaType === 'movie' ? tmdbMovieToContentItem : tmdbTVToContentItem;
      similar = results.slice(0, 10).map(toItem);
    }
  } catch {
    // Similar is non-essential — a failure here must not blank the page.
  }

  return { detail, similar };
}

export function useContentDetail(contentItemId: string, userPlatformIds?: number[]) {
  return useQuery({
    queryKey: ['native', 'detail', contentItemId, userPlatformIds?.join(',') ?? ''],
    queryFn: () => fetchContentDetail(contentItemId, userPlatformIds),
    staleTime: 30 * 60 * 1000,
  });
}
