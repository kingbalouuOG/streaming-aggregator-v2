import { getCurrentSessionId } from '@/lib/instrumentation/sessionId';
import { emitContentInteraction } from '@/lib/storage/interactions';
import {
  applyInteractionIncremental,
  applyInteractionToCentroids,
  eventUsesEmbedding,
  fetchTitleEmbedding,
} from '@/lib/taste-v2/interactionUpdate';
import {
  getInterestCentroids,
  getV2TasteProfile,
  updateInterestCentroidVector,
  updateV2TasteVector,
} from '@/lib/taste-v2/tasteProfileV2';

// Native equivalent of the web useTasteProfile.trackInteraction (NATIVE
// polish W1). Plain async (no React) — loads the profile fresh, emits the
// outcome event, and applies the incremental EMA to the summary vector +
// nearest interest centroid. All shared lib; negatives are no-ops in the
// EMA path (the engine routes them to the avoid set). Fire-and-forget.

type TasteAction = 'thumbs_up' | 'thumbs_down' | 'watchlist_add' | 'watched' | 'removed';

export async function trackTasteInteraction(
  meta: { contentId: number; contentType: 'movie' | 'tv'; title?: string; genreIds?: number[] },
  action: TasteAction,
): Promise<void> {
  try {
    emitContentInteraction(action, meta.contentId, meta.contentType, {
      title: meta.title,
      genre_ids: meta.genreIds ?? [],
    });

    // Fetch the title embedding once and share it across both taste paths
    // (summary vector + nearest centroid) — one `titles` query, and at most
    // one "no embedding" warning per interaction.
    const needsEmbedding = eventUsesEmbedding(action);
    const embedding = needsEmbedding
      ? await fetchTitleEmbedding(meta.contentId, meta.contentType)
      : null;
    if (needsEmbedding && !embedding) {
      console.warn('[InteractionUpdate] No embedding found for', meta.contentType, meta.contentId);
    }

    const profile = await getV2TasteProfile();
    if (profile?.tasteVector) {
      const result = await applyInteractionIncremental(
        profile.tasteVector,
        meta.contentId,
        meta.contentType,
        action,
        profile.interactionCount,
        getCurrentSessionId(),
        embedding,
      );
      if (result) await updateV2TasteVector(result.vector, result.newCount);
    }

    const centroids = await getInterestCentroids();
    if (centroids.length > 0) {
      const update = await applyInteractionToCentroids(
        centroids,
        meta.contentId,
        meta.contentType,
        action,
        profile?.interactionCount ?? 0,
        getCurrentSessionId(),
        embedding,
      );
      if (update) await updateInterestCentroidVector(update.slot, update.vector);
    }
  } catch (err) {
    console.error('[trackInteraction]', err);
  }
}
