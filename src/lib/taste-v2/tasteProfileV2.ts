/**
 * Taste Profile V2 — CRUD
 *
 * Reads/writes the v2 taste vector and slider columns on taste_profiles.
 * Uses the existing Supabase client. RLS scopes all queries to auth.uid().
 */

import { supabase } from '../supabase';
import { getAuthUserId, isSupabaseActive } from '../storage';
import type { UserScope } from '../server/userScope';
import type {
  TasteProfileV2,
  TasteVectorV2,
  SliderState,
  BootstrapSource,
  InterestCentroid,
} from './types';
import { DEFAULT_SLIDERS, MAX_INTEREST_CENTROIDS } from './types';

// Session-scope cache for taste profile (avoids duplicate fetches from parallel hooks)
let profileCache: { data: TasteProfileV2 | null; ts: number } | null = null;
let centroidsCache: { data: InterestCentroid[]; ts: number } | null = null;
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateV2ProfileCache() {
  profileCache = null;
  centroidsCache = null;
}

/**
 * Read the v2 taste profile from Supabase.
 * Cached for 5 minutes to avoid duplicate fetches from parallel hooks.
 * Returns null if no profile row exists or Supabase is inactive.
 */
export async function getV2TasteProfile(): Promise<TasteProfileV2 | null> {
  if (profileCache && Date.now() - profileCache.ts < PROFILE_CACHE_TTL) {
    return profileCache.data;
  }

  if (!isSupabaseActive()) return null;

  const userId = getAuthUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('taste_profiles')
    .select('taste_vector_v2, taste_vector_updated_at, taste_vector_interaction_count, taste_vector_bootstrapped_from, selected_clusters, slider_catalogue_age, slider_comfort_zone, slider_content_mix, slider_variety')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[TasteV2] getV2TasteProfile failed:', error.message);
    return null;
  }

  if (!data) return null;

  // PostgREST returns pgvector as a JSON string — parse it
  let tasteVector: TasteVectorV2 | null = null;
  if (data.taste_vector_v2) {
    tasteVector = typeof data.taste_vector_v2 === 'string'
      ? JSON.parse(data.taste_vector_v2)
      : data.taste_vector_v2 as TasteVectorV2;
  }

  const result: TasteProfileV2 = {
    tasteVector,
    updatedAt: data.taste_vector_updated_at || null,
    interactionCount: data.taste_vector_interaction_count ?? 0,
    bootstrappedFrom: data.taste_vector_bootstrapped_from as BootstrapSource | null,
    selectedClusters: Array.isArray(data.selected_clusters) ? data.selected_clusters as string[] : [],
    sliders: {
      catalogueAge: data.slider_catalogue_age ?? DEFAULT_SLIDERS.catalogueAge,
      comfortZone: data.slider_comfort_zone ?? DEFAULT_SLIDERS.comfortZone,
      contentMix: data.slider_content_mix ?? DEFAULT_SLIDERS.contentMix,
      variety: data.slider_variety ?? DEFAULT_SLIDERS.variety,
    },
  };

  profileCache = { data: result, ts: Date.now() };
  return result;
}

/**
 * Save the v2 taste vector and metadata.
 * Upserts on user_id — creates row if none exists.
 */
export async function saveV2TasteVector(
  vector: TasteVectorV2,
  interactionCount: number,
  bootstrappedFrom: BootstrapSource,
): Promise<void> {
  invalidateV2ProfileCache();
  if (!isSupabaseActive()) return;

  const userId = getAuthUserId();
  if (!userId) return;

  // pgvector expects a string representation: "[0.1,0.2,...]"
  const vectorStr = `[${vector.join(',')}]`;

  const { error } = await supabase
    .from('taste_profiles')
    .upsert({
      user_id: userId,
      taste_vector_v2: vectorStr,
      taste_vector_updated_at: new Date().toISOString(),
      taste_vector_interaction_count: interactionCount,
      taste_vector_bootstrapped_from: bootstrappedFrom,
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('[TasteV2] saveV2TasteVector failed:', error.message);
    throw error;
  }
}

/**
 * Update only the taste vector and interaction count (after an interaction).
 * Preserves all other columns.
 */
export async function updateV2TasteVector(
  vector: TasteVectorV2,
  interactionCount: number,
): Promise<void> {
  invalidateV2ProfileCache();
  if (!isSupabaseActive()) return;

  const userId = getAuthUserId();
  if (!userId) return;

  const vectorStr = `[${vector.join(',')}]`;

  const { error } = await supabase
    .from('taste_profiles')
    .update({
      taste_vector_v2: vectorStr,
      taste_vector_updated_at: new Date().toISOString(),
      taste_vector_interaction_count: interactionCount,
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[TasteV2] updateV2TasteVector failed:', error.message);
    throw error;
  }
}

// ── Interest centroids (ENG-1, migration 044) ──

/**
 * Read the user's interest centroids, ordered by slot.
 * Returns [] when none exist — callers treat that as "single-centroid
 * fallback path" (taste_vector_v2), which is every user until their
 * first post-ENG-1 bootstrap or 24h recompute.
 */
export async function getInterestCentroids(): Promise<InterestCentroid[]> {
  if (centroidsCache && Date.now() - centroidsCache.ts < PROFILE_CACHE_TTL) {
    return centroidsCache.data;
  }

  if (!isSupabaseActive()) return [];

  const userId = getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('user_interest_centroids')
    .select('slot, centroid, weight, updated_at')
    .eq('user_id', userId)
    .order('slot', { ascending: true });

  if (error) {
    console.error('[TasteV2] getInterestCentroids failed:', error.message);
    return [];
  }

  // PostgREST returns pgvector as a JSON string — parse it
  const result: InterestCentroid[] = (data ?? [])
    .map(row => {
      const centroid = typeof row.centroid === 'string'
        ? JSON.parse(row.centroid) as TasteVectorV2
        : row.centroid as unknown as TasteVectorV2;
      return {
        slot: row.slot,
        centroid,
        weight: row.weight,
        updatedAt: row.updated_at,
      };
    })
    .filter(c => Array.isArray(c.centroid) && c.centroid.length > 0);

  centroidsCache = { data: result, ts: Date.now() };
  return result;
}

/**
 * Replace the user's interest centroids. Caller order is canonical —
 * rows are written to slots 0..K-1 and any higher slots from a previous,
 * larger K are deleted (k-means refresh can shrink K).
 * updated_at is owned by the touch trigger (migration 044).
 */
export async function saveInterestCentroids(
  centroids: { centroid: TasteVectorV2; weight: number }[],
): Promise<void> {
  invalidateV2ProfileCache();
  if (!isSupabaseActive()) return;

  const userId = getAuthUserId();
  if (!userId) return;

  if (centroids.length === 0 || centroids.length > MAX_INTEREST_CENTROIDS) {
    console.error('[TasteV2] saveInterestCentroids: invalid count', centroids.length);
    return;
  }

  const rows = centroids.map((c, i) => ({
    user_id: userId,
    slot: i,
    centroid: `[${c.centroid.join(',')}]`,
    weight: c.weight,
  }));

  const { error: upsertError } = await supabase
    .from('user_interest_centroids')
    .upsert(rows, { onConflict: 'user_id,slot' });

  if (upsertError) {
    console.error('[TasteV2] saveInterestCentroids upsert failed:', upsertError.message);
    throw upsertError;
  }

  const { error: deleteError } = await supabase
    .from('user_interest_centroids')
    .delete()
    .eq('user_id', userId)
    .gte('slot', centroids.length);

  if (deleteError) {
    console.error('[TasteV2] saveInterestCentroids cleanup failed:', deleteError.message);
    throw deleteError;
  }
}

/**
 * Update a single centroid's vector in place (incremental EMA path —
 * writes one row, not all K). Weight is untouched; weight refresh is a
 * batch-recompute concern.
 */
export async function updateInterestCentroidVector(
  slot: number,
  centroid: TasteVectorV2,
): Promise<void> {
  invalidateV2ProfileCache();
  if (!isSupabaseActive()) return;

  const userId = getAuthUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('user_interest_centroids')
    .update({ centroid: `[${centroid.join(',')}]` })
    .eq('user_id', userId)
    .eq('slot', slot);

  if (error) {
    console.error('[TasteV2] updateInterestCentroidVector failed:', error.message);
    throw error;
  }
}

/** Read slider state from taste_profiles */
export async function getSliderState(): Promise<SliderState> {
  if (!isSupabaseActive()) return { ...DEFAULT_SLIDERS };

  const userId = getAuthUserId();
  if (!userId) return { ...DEFAULT_SLIDERS };

  const { data, error } = await supabase
    .from('taste_profiles')
    .select('slider_catalogue_age, slider_comfort_zone, slider_content_mix, slider_variety')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_SLIDERS };

  return {
    catalogueAge: data.slider_catalogue_age ?? DEFAULT_SLIDERS.catalogueAge,
    comfortZone: data.slider_comfort_zone ?? DEFAULT_SLIDERS.comfortZone,
    contentMix: data.slider_content_mix ?? DEFAULT_SLIDERS.contentMix,
    variety: data.slider_variety ?? DEFAULT_SLIDERS.variety,
  };
}

/** Save slider state to taste_profiles */
export async function saveSliderState(sliders: SliderState): Promise<void> {
  if (!isSupabaseActive()) return;

  const userId = getAuthUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('taste_profiles')
    .upsert({
      user_id: userId,
      slider_catalogue_age: sliders.catalogueAge,
      slider_comfort_zone: sliders.comfortZone,
      slider_content_mix: sliders.contentMix,
      slider_variety: sliders.variety,
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('[TasteV2] saveSliderState failed:', error.message);
    throw error;
  }
}

// ─── Scoped (server) read variants — PLAT-3, absorbed from the ADR-011
// mirror so the videx-api Worker imports THIS tree. No module-level
// profileCache: server requests are independent and the 5-min client
// cache exists only to dedupe parallel hooks. Write paths are not
// ported — the foryou render is read-only (the IN-466 contract).

interface TasteProfileRow {
  taste_vector_v2: string | number[] | null;
  taste_vector_updated_at: string | null;
  taste_vector_interaction_count: number | null;
  taste_vector_bootstrapped_from: string | null;
  selected_clusters: unknown;
  slider_catalogue_age: number | null;
  slider_comfort_zone: number | null;
  slider_content_mix: number | null;
  slider_variety: number | null;
}

export async function getV2TasteProfileScoped(scope: UserScope): Promise<TasteProfileV2 | null> {
  const { data, error } = await scope
    .select(
      'taste_profiles',
      'taste_vector_v2, taste_vector_updated_at, taste_vector_interaction_count, '
      + 'taste_vector_bootstrapped_from, selected_clusters, '
      + 'slider_catalogue_age, slider_comfort_zone, slider_content_mix, slider_variety',
    )
    .maybeSingle();

  if (error) {
    console.error('[TasteV2] getV2TasteProfileScoped failed:', error.message);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as TasteProfileRow;

  // PostgREST returns pgvector as a JSON string — parse it
  let tasteVector: TasteVectorV2 | null = null;
  if (row.taste_vector_v2) {
    tasteVector = typeof row.taste_vector_v2 === 'string'
      ? JSON.parse(row.taste_vector_v2) as TasteVectorV2
      : row.taste_vector_v2;
  }

  return {
    tasteVector,
    updatedAt: row.taste_vector_updated_at || null,
    interactionCount: row.taste_vector_interaction_count ?? 0,
    bootstrappedFrom: row.taste_vector_bootstrapped_from as BootstrapSource | null,
    selectedClusters: Array.isArray(row.selected_clusters) ? row.selected_clusters as string[] : [],
    sliders: {
      catalogueAge: row.slider_catalogue_age ?? DEFAULT_SLIDERS.catalogueAge,
      comfortZone: row.slider_comfort_zone ?? DEFAULT_SLIDERS.comfortZone,
      contentMix: row.slider_content_mix ?? DEFAULT_SLIDERS.contentMix,
      variety: row.slider_variety ?? DEFAULT_SLIDERS.variety,
    },
  };
}

interface CentroidRow {
  slot: number;
  centroid: string | number[];
  weight: number;
  updated_at: string;
}

/**
 * Scoped read of interest centroids, ordered by slot (ENG-1, migration
 * 044). [] = single-centroid fallback path. Read-only — centroid writes
 * (bootstrap, EMA, k-means refresh) stay client-side until W5 moves the
 * batch recompute server-side.
 */
export async function getInterestCentroidsScoped(scope: UserScope): Promise<InterestCentroid[]> {
  const { data, error } = await scope
    .select('user_interest_centroids', 'slot, centroid, weight, updated_at')
    .order('slot', { ascending: true });

  if (error) {
    console.error('[TasteV2] getInterestCentroidsScoped failed:', error.message);
    return [];
  }

  return ((data ?? []) as unknown as CentroidRow[])
    .map(row => {
      const centroid: TasteVectorV2 = typeof row.centroid === 'string'
        ? JSON.parse(row.centroid) as TasteVectorV2
        : row.centroid;
      return {
        slot: row.slot,
        centroid,
        weight: row.weight,
        updatedAt: row.updated_at,
      };
    })
    .filter(c => Array.isArray(c.centroid) && c.centroid.length > 0);
}

export async function getSliderStateScoped(scope: UserScope): Promise<SliderState> {
  const { data, error } = await scope
    .select(
      'taste_profiles',
      'slider_catalogue_age, slider_comfort_zone, slider_content_mix, slider_variety',
    )
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_SLIDERS };

  const row = data as unknown as TasteProfileRow;
  return {
    catalogueAge: row.slider_catalogue_age ?? DEFAULT_SLIDERS.catalogueAge,
    comfortZone: row.slider_comfort_zone ?? DEFAULT_SLIDERS.comfortZone,
    contentMix: row.slider_content_mix ?? DEFAULT_SLIDERS.contentMix,
    variety: row.slider_variety ?? DEFAULT_SLIDERS.variety,
  };
}

// ── Scoped (server) write variants — PLAT-3 W5, for the nightly
// stale-recompute cron. Writes go through the UserScope verbs (user_id
// injected/filtered by the wrapper). No invalidateV2ProfileCache calls:
// the client-side 5-min cache lives in browser memory; server writes
// are picked up there naturally on its next expiry, and the Worker's
// KV feed-cache key embeds taste_vector_updated_at, so these writes
// bust the feed cache by construction.

/** Mirror of updateV2TasteVector: vector + count + timestamp only,
 *  preserves all other columns. */
export async function updateV2TasteVectorScoped(
  scope: UserScope,
  vector: TasteVectorV2,
  interactionCount: number,
): Promise<void> {
  const { error } = await scope.update('taste_profiles', {
    taste_vector_v2: `[${vector.join(',')}]`,
    taste_vector_updated_at: new Date().toISOString(),
    taste_vector_interaction_count: interactionCount,
  });

  if (error) {
    console.error('[TasteV2] updateV2TasteVectorScoped failed:', error.message);
    throw new Error(error.message);
  }
}

/** Mirror of saveInterestCentroids: slots 0..K-1 upserted, higher slots
 *  from a previous larger K deleted. updated_at owned by the touch
 *  trigger (migration 044). */
export async function saveInterestCentroidsScoped(
  scope: UserScope,
  centroids: { centroid: TasteVectorV2; weight: number }[],
): Promise<void> {
  if (centroids.length === 0 || centroids.length > MAX_INTEREST_CENTROIDS) {
    console.error('[TasteV2] saveInterestCentroidsScoped: invalid count', centroids.length);
    return;
  }

  const rows = centroids.map((c, i) => ({
    slot: i,
    centroid: `[${c.centroid.join(',')}]`,
    weight: c.weight,
  }));

  const { error: upsertError } = await scope.upsert(
    'user_interest_centroids',
    rows,
    { onConflict: 'user_id,slot' },
  );
  if (upsertError) {
    console.error('[TasteV2] saveInterestCentroidsScoped upsert failed:', upsertError.message);
    throw new Error(upsertError.message);
  }

  const { error: deleteError } = await scope
    .deleteWhere('user_interest_centroids')
    .gte('slot', centroids.length);
  if (deleteError) {
    console.error('[TasteV2] saveInterestCentroidsScoped cleanup failed:', deleteError.message);
    throw new Error(deleteError.message);
  }
}
