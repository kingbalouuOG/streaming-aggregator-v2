/**
 * Anchor room label client (IN-463).
 *
 * Two-step flow used by `useAnchorMoodRooms`:
 *
 *   1. `getCachedAnchorLabels(anchors)` reads the `mood_room_anchor_labels`
 *      cache table in a single batch. Cache hits return instantly.
 *
 *   2. For any anchor missing a cached label, the hook calls
 *      `requestAnchorLabel(anchor, topTitles)` which invokes the
 *      `label-anchor-room` Edge Function. The function checks the cache
 *      again (race-resilient), generates via gpt-4o-mini if missing,
 *      writes the cache, returns the result.
 *
 * Same-anchor labels are shared across users — once The Hangover has a
 * label, every user with The Hangover as a Tier 2 anchor reads from
 * cache.
 */

import { supabase } from '../supabase';
import type { SelectedAnchor } from './anchorSelection';

export interface AnchorRoomLabel {
  label: string;
  description: string | null;
}

function anchorKey(a: { tmdbId: number; mediaType: 'movie' | 'tv' }): string {
  return `${a.mediaType}-${a.tmdbId}`;
}

/**
 * Batch-read the label cache for a set of anchors. Returns a map keyed
 * by `${mediaType}-${tmdbId}`. Anchors not in the cache are absent
 * from the map; the caller fires the Edge Function for those.
 */
export async function getCachedAnchorLabels(
  anchors: { tmdbId: number; mediaType: 'movie' | 'tv' }[],
): Promise<Map<string, AnchorRoomLabel>> {
  const out = new Map<string, AnchorRoomLabel>();
  if (anchors.length === 0) return out;

  const tmdbIds = [...new Set(anchors.map((a) => a.tmdbId))];
  const { data, error } = await supabase
    .from('mood_room_anchor_labels')
    .select('anchor_tmdb_id, anchor_media_type, label, description')
    .in('anchor_tmdb_id', tmdbIds);

  if (error || !data) return out;

  const wanted = new Set(anchors.map(anchorKey));
  for (const row of data) {
    const key = `${row.anchor_media_type}-${row.anchor_tmdb_id}`;
    if (!wanted.has(key)) continue;
    out.set(key, { label: row.label, description: row.description });
  }
  return out;
}

/**
 * Request a thematic label for a single anchor via the label-anchor-room
 * Edge Function. The function side handles cache lookup + LLM call +
 * cache write. Returns null on hard failure (caller falls back to the
 * literal "If you love {anchor}" label).
 */
export async function requestAnchorLabel(
  anchor: SelectedAnchor & { title: string; year: number | null },
  topTitles: { title: string; year: number | null }[],
): Promise<AnchorRoomLabel | null> {
  try {
    const { data, error } = await supabase.functions.invoke('label-anchor-room', {
      body: {
        anchor: {
          tmdbId: anchor.tmdbId,
          mediaType: anchor.mediaType,
          title: anchor.title,
          year: anchor.year,
        },
        topTitles: topTitles.slice(0, 8),
      },
    });
    if (error) {
      console.error('[anchorRoomLabels] Edge Function failed:', error.message);
      return null;
    }
    if (!data || typeof data.label !== 'string') return null;
    return {
      label: data.label,
      description: typeof data.description === 'string' ? data.description : null,
    };
  } catch (err) {
    console.error('[anchorRoomLabels] invoke threw:', err);
    return null;
  }
}
