/**
 * Taste Profile V2 — CRUD
 *
 * Reads/writes the v2 taste vector and slider columns on taste_profiles.
 * Uses the existing Supabase client. RLS scopes all queries to auth.uid().
 */

import { supabase } from '../supabase';
import { getAuthUserId, isSupabaseActive } from '../storage';
import type {
  TasteProfileV2,
  TasteVectorV2,
  SliderState,
  BootstrapSource,
} from './types';
import { DEFAULT_SLIDERS } from './types';

// Session-scope cache for taste profile (avoids duplicate fetches from parallel hooks)
let profileCache: { data: TasteProfileV2 | null; ts: number } | null = null;
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateV2ProfileCache() {
  profileCache = null;
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
