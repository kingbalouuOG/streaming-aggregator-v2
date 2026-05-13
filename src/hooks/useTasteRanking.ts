// useTasteRanking — re-rank a list of ContentItems by cosine
// similarity to the user's taste vector. Used by the BrowsePage's
// "Best match" sort in filter-only mode: the user picks filters,
// the catalogue returns a slice ordered by popularity, and we
// then surface the slice items closest to the user's taste vector
// first.
//
// Embeddings live on `titles.embedding` (1536D, OpenAI text-
// embedding-3-small). Taste vector is the same dimension (centroid
// of the items the user's reacted to). Cosine similarity client-
// side is cheap once we have both vectors loaded — the work is
// batching the embedding lookup.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cosineSimilarity } from "@/lib/taste-v2/vectorOps";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import type { ContentItem } from "@/components/ContentCard";

interface UseTasteRankingState {
  /** The input items re-sorted by descending cosine similarity to
   *  the user's taste vector. Items without an embedding in the
   *  `titles` cache fall to the end of the list (preserved input
   *  order between themselves). Null when not ready / disabled —
   *  caller should use the source items in that case. */
  rankedItems: ContentItem[] | null;
  loading: boolean;
}

export function useTasteRanking(
  items: readonly ContentItem[],
  tasteVector: number[] | null | undefined,
  enabled: boolean,
): UseTasteRankingState {
  const [rankedItems, setRankedItems] = useState<ContentItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Stabilise the dependency — re-running on every re-render of the
  // same items would refetch unnecessarily. Use a hash of the ids to
  // trigger an update only when the set actually changes.
  const itemKey = items.map((i) => i.id).join("|");

  useEffect(() => {
    if (!enabled || !tasteVector || tasteVector.length === 0 || items.length === 0) {
      setRankedItems(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      // Build a list of unique (tmdb_id, media_type) tuples to fetch
      // embeddings for. The Supabase client doesn't have a tuple-
      // membership query helper, so we use the broader `in('tmdb_id')`
      // approach and filter media_type client-side. Search results
      // rarely have collisions between movie and TV with the same
      // tmdb_id; cheap to over-fetch.
      const tmdbIds = Array.from(
        new Set(
          items
            .map((i) => parseContentItemId(i.id).tmdbId)
            .filter((n) => Number.isFinite(n)),
        ),
      );
      if (tmdbIds.length === 0) {
        if (!cancelled) {
          setRankedItems(null);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("titles")
        .select("tmdb_id, media_type, embedding")
        .in("tmdb_id", tmdbIds)
        .not("embedding", "is", null);

      if (cancelled) return;
      if (error || !data) {
        setRankedItems(null);
        setLoading(false);
        return;
      }

      // Build a similarity map keyed on `${mediaType}-${tmdbId}` to
      // match ContentItem.id's format.
      const sim = new Map<string, number>();
      for (const row of data as Array<{ tmdb_id: number; media_type: string; embedding: unknown }>) {
        const raw = row.embedding;
        // pgvector returns embedding as a stringified array like
        // "[0.1,0.2,...]" over the REST/PostgREST wire — parse it.
        let vec: number[] | null = null;
        if (typeof raw === "string") {
          try {
            vec = JSON.parse(raw) as number[];
          } catch {
            vec = null;
          }
        } else if (Array.isArray(raw)) {
          vec = raw as number[];
        }
        if (!vec || vec.length === 0) continue;
        const score = cosineSimilarity(tasteVector, vec);
        sim.set(`${row.media_type}-${row.tmdb_id}`, score);
      }

      // Stable sort: items with a similarity score sort by score
      // descending; items without one keep their input order at the
      // bottom of the list.
      const indexed = items.map((item, idx) => ({
        item,
        idx,
        score: sim.get(item.id),
      }));
      indexed.sort((a, b) => {
        const aHas = a.score !== undefined;
        const bHas = b.score !== undefined;
        if (aHas && bHas) return (b.score as number) - (a.score as number);
        if (aHas) return -1;
        if (bHas) return 1;
        return a.idx - b.idx;
      });
      setRankedItems(indexed.map((x) => x.item));
      setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setRankedItems(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, tasteVector, enabled]);

  return { rankedItems, loading };
}
