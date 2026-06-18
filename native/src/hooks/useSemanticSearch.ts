import { useQuery } from '@tanstack/react-query';

import { getFlag } from '@/lib/featureFlags';
import { semanticSearch } from '@/lib/recommendations-v2/search/semanticRetrieval';
import { defaultFor } from '@/lib/search/filterState';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import type { ContentItem } from '@/lib/types/content';

// Semantic ("vector") mood search on native — the Option-2 port. Reuses the
// shared engine end-to-end: getFlag (per-user gate), semanticSearch (embed
// via the JWT-gated embed-query Edge fn → match_titles_by_vector → rank →
// ContentItem). Gated behind the `search_semantic` flag; when OFF, the Browse
// screen falls back to the deterministic mood filter presets. No filters are
// applied for moods (the mood phrase IS the query), so defaultFor([]) yields
// a no-op post-filter.

export function useSemanticFlag() {
  return useQuery({
    queryKey: ['native', 'flag', 'search_semantic'],
    queryFn: () => getFlag('search_semantic', false),
    staleTime: 10 * 60 * 1000,
  });
}

async function runSemantic(query: string): Promise<ContentItem[]> {
  // Taste vector drives the 25% taste-fit component; null is a neutral 0.5.
  const profile = await getV2TasteProfile().catch(() => null);
  const res = await semanticSearch({
    query,
    filters: defaultFor([]),
    userTasteVector: profile?.tasteVector ?? null,
    candidateLimit: 150,
    resultLimit: 60,
  });
  // Quality floor — drop unrated/obscure entries and sub-40-min movie shorts
  // (TV episodes are legitimately short). Mirrors scripts/search/eval-moods.ts.
  return res.items.filter(
    (it) =>
      (it.rating ?? 0) > 0 &&
      (it.voteCount ?? 0) >= 20 &&
      (it.type === 'tv' || !it.runtime || it.runtime >= 40),
  );
}

export function useSemanticSearch(query: string | null, enabled: boolean) {
  const q = (query ?? '').trim();
  return useQuery({
    queryKey: ['native', 'semanticSearch', q],
    queryFn: () => runSemantic(q),
    enabled: enabled && q.length > 0,
    staleTime: 10 * 60 * 1000,
    // Semantic depends on the embed-query Edge fn; a transient failure
    // shouldn't hammer it. One retry is enough.
    retry: 1,
  });
}
