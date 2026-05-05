// Mirror of src/lib/recommendations-v2/anchoredRoom.ts — IN-466 / ADR-011.
// Edge-side: takes SupabaseClient as a parameter; otherwise bit-for-bit.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { applyAnchorHardFilters } from './hardFilters.ts';
import { titleRowToContentItem } from './titleAdapter.ts';
import {
  distanceToSimilarity,
  scoreToMatchPercentage,
} from './weights.ts';
import type {
  MatchedTitle,
  ExtendedTitleRow,
  ContentItem,
} from './types.ts';
import { EXTENDED_TITLE_SELECT as TITLE_SELECT } from './types.ts';
import type { FilterSets } from './hardFilters.ts';

export interface BuildAnchoredRoomOptions {
  anchorTmdbId: number;
  anchorMediaType: 'movie' | 'tv';
  filterSets: FilterSets;
  limit?: number;
  matchLimit?: number;
  excludeWatchlist?: boolean;
}

export interface BuildAnchoredRoomResult {
  items: ContentItem[];
  rawMatchCount: number;
  filteredCount: number;
}

export async function buildAnchoredRoom(
  client: SupabaseClient,
  opts: BuildAnchoredRoomOptions,
): Promise<BuildAnchoredRoomResult> {
  const {
    anchorTmdbId,
    anchorMediaType,
    filterSets,
    limit = 30,
    matchLimit = 200,
    excludeWatchlist = true,
  } = opts;

  const { data: anchorRows, error: anchorError } = await client
    .from('titles')
    .select('embedding')
    .eq('tmdb_id', anchorTmdbId)
    .eq('media_type', anchorMediaType)
    .limit(1);

  if (anchorError || !anchorRows?.length) {
    console.error('[anchoredRoom] embedding fetch failed:', anchorError?.message);
    return { items: [], rawMatchCount: 0, filteredCount: 0 };
  }

  const embeddingStr = (anchorRows[0] as { embedding: string | null }).embedding;
  if (!embeddingStr) return { items: [], rawMatchCount: 0, filteredCount: 0 };

  let embedding: number[];
  try {
    embedding = JSON.parse(embeddingStr);
  } catch {
    console.error('[anchoredRoom] failed to parse anchor embedding');
    return { items: [], rawMatchCount: 0, filteredCount: 0 };
  }

  const vectorStr = `[${embedding.join(',')}]`;
  const { data: matchedRaw, error: rpcError } = await client.rpc('match_titles_by_vector', {
    query_vector: vectorStr,
    match_limit: matchLimit,
  });

  if (rpcError || !matchedRaw) {
    console.error('[anchoredRoom] match_titles_by_vector failed:', rpcError?.message);
    return { items: [], rawMatchCount: 0, filteredCount: 0 };
  }

  const matched = matchedRaw as MatchedTitle[];
  const rawMatchCount = matched.length;

  const withoutAnchor = matched.filter(
    (t) => !(t.tmdb_id === anchorTmdbId && t.media_type === anchorMediaType),
  );
  const filtered = applyAnchorHardFilters(withoutAnchor, filterSets, {
    excludeWatchlist,
  });

  if (filtered.length === 0) {
    return { items: [], rawMatchCount, filteredCount: 0 };
  }

  const top = filtered.slice(0, limit);
  const tmdbIds = [...new Set(top.map((t) => t.tmdb_id))];
  const metadata = await fetchExtendedMetadata(client, tmdbIds);

  const items: ContentItem[] = [];
  for (const match of top) {
    const meta = metadata.get(`${match.media_type}-${match.tmdb_id}`);
    if (!meta) continue;
    const similarity = distanceToSimilarity(match.distance);
    items.push(titleRowToContentItem(meta, scoreToMatchPercentage(similarity)));
  }

  return { items, rawMatchCount, filteredCount: filtered.length };
}

async function fetchExtendedMetadata(
  client: SupabaseClient,
  tmdbIds: number[],
): Promise<Map<string, ExtendedTitleRow>> {
  const map = new Map<string, ExtendedTitleRow>();
  if (tmdbIds.length === 0) return map;

  const { data: rows, error } = await client
    .from('titles')
    .select(TITLE_SELECT)
    .in('tmdb_id', tmdbIds);

  if (error || !rows) {
    console.error('[anchoredRoom] metadata fetch failed:', error?.message);
    return map;
  }

  for (const row of rows) {
    const typed = row as unknown as ExtendedTitleRow;
    map.set(`${typed.media_type}-${typed.tmdb_id}`, typed);
  }

  return map;
}
