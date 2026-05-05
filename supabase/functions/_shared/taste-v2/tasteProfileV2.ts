// Mirror of src/lib/taste-v2/tasteProfileV2.ts (read paths only) — IN-466 / ADR-011.
//
// Edge-side adjustments vs the client copy:
// - No module-level profileCache. Every Edge Function invocation is a
//   fresh cold context; caching would only add complexity for no gain
//   inside a single request, and we can't share state across requests
//   safely on a multi-instance runtime.
// - Takes UserScope instead of using a singleton client + getAuthUserId().
// - Write paths (saveV2TasteVector, updateV2TasteVector, saveSliderState)
//   are not ported — render-foryou-rows is read-only. If a future Edge
//   Function needs writes, port them then.

import type { UserScope } from '../userScope.ts';
import type {
  TasteProfileV2,
  TasteVectorV2,
  SliderState,
  BootstrapSource,
} from './types.ts';
import { DEFAULT_SLIDERS } from './types.ts';

export async function getV2TasteProfile(scope: UserScope): Promise<TasteProfileV2 | null> {
  const { data, error } = await scope
    .select(
      'taste_profiles',
      'taste_vector_v2, taste_vector_updated_at, taste_vector_interaction_count, ' +
      'taste_vector_bootstrapped_from, selected_clusters, ' +
      'slider_catalogue_age, slider_comfort_zone, slider_content_mix, slider_variety',
    )
    .maybeSingle();

  if (error) {
    console.error('[TasteV2] getV2TasteProfile failed:', error.message);
    return null;
  }
  if (!data) return null;

  const row = data as any;

  let tasteVector: TasteVectorV2 | null = null;
  if (row.taste_vector_v2) {
    tasteVector = typeof row.taste_vector_v2 === 'string'
      ? JSON.parse(row.taste_vector_v2)
      : row.taste_vector_v2;
  }

  return {
    tasteVector,
    updatedAt: row.taste_vector_updated_at || null,
    interactionCount: row.taste_vector_interaction_count ?? 0,
    bootstrappedFrom: row.taste_vector_bootstrapped_from as BootstrapSource | null,
    selectedClusters: Array.isArray(row.selected_clusters) ? row.selected_clusters : [],
    sliders: {
      catalogueAge: row.slider_catalogue_age ?? DEFAULT_SLIDERS.catalogueAge,
      comfortZone: row.slider_comfort_zone ?? DEFAULT_SLIDERS.comfortZone,
      contentMix: row.slider_content_mix ?? DEFAULT_SLIDERS.contentMix,
      variety: row.slider_variety ?? DEFAULT_SLIDERS.variety,
    },
  };
}

export async function getSliderState(scope: UserScope): Promise<SliderState> {
  const { data, error } = await scope
    .select(
      'taste_profiles',
      'slider_catalogue_age, slider_comfort_zone, slider_content_mix, slider_variety',
    )
    .maybeSingle();

  if (error || !data) return { ...DEFAULT_SLIDERS };

  const row = data as any;
  return {
    catalogueAge: row.slider_catalogue_age ?? DEFAULT_SLIDERS.catalogueAge,
    comfortZone: row.slider_comfort_zone ?? DEFAULT_SLIDERS.comfortZone,
    contentMix: row.slider_content_mix ?? DEFAULT_SLIDERS.contentMix,
    variety: row.slider_variety ?? DEFAULT_SLIDERS.variety,
  };
}
