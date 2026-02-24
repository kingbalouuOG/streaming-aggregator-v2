/**
 * Vector Serialisation
 *
 * Converts between the app's named TasteVector (Record<Dimension, number>)
 * and the positional float4[] array stored in Supabase.
 *
 * Uses ALL_DIMENSIONS as the canonical positional order — single source of truth.
 *
 * Migration: Three historical array formats exist in Supabase:
 * - 25D (pre-T1): included anime, family, western → skip anime only
 * - 22D (T1 interim): anime/family/western all removed → map via frozen order
 * - 24D (current): anime removed, family/western restored → direct ALL_DIMENSIONS
 */

import { ALL_DIMENSIONS, type TasteVector, type Dimension, createEmptyVector } from './tasteVector';

// Frozen positional order from the original 25D vector model.
// Used to correctly read legacy Supabase float4[25] arrays.
const OLD_25D_DIMENSIONS = [
  'action', 'adventure', 'animation', 'anime', 'comedy', 'crime',
  'documentary', 'drama', 'family', 'fantasy', 'history', 'horror',
  'musical', 'mystery', 'reality', 'romance', 'scifi', 'thriller',
  'war', 'western', 'tone', 'pacing', 'era', 'popularity', 'intensity',
] as const;

// Frozen positional order from the T1 interim period (22D).
// Family and western were removed alongside anime, then restored.
const INTERIM_22D_DIMENSIONS = [
  'action', 'adventure', 'animation', 'comedy', 'crime',
  'documentary', 'drama', 'fantasy', 'history', 'horror',
  'musical', 'mystery', 'reality', 'romance', 'scifi', 'thriller',
  'war', 'tone', 'pacing', 'era', 'popularity', 'intensity',
] as const;

// Only anime is permanently removed.
const REMOVED_DIMS = new Set(['anime']);

/** Convert a named TasteVector to a positional array for Supabase */
export function vectorToArray(vector: TasteVector): number[] {
  return ALL_DIMENSIONS.map(dim => vector[dim] ?? 0);
}

/** Convert a positional array from Supabase to a named TasteVector */
export function arrayToVector(arr: number[]): TasteVector {
  const vector = createEmptyVector();

  if (arr.length === 25) {
    // Legacy 25D format: map using old order, skip anime only
    OLD_25D_DIMENSIONS.forEach((dim, i) => {
      if (!REMOVED_DIMS.has(dim)) {
        vector[dim as Dimension] = arr[i] ?? 0;
      }
    });
  } else if (arr.length === 22) {
    // T1 interim 22D format: family/western were removed, map via frozen order
    INTERIM_22D_DIMENSIONS.forEach((dim, i) => {
      if (dim in vector) {
        vector[dim as Dimension] = arr[i] ?? 0;
      }
    });
  } else {
    // Current 24D format: map using ALL_DIMENSIONS
    ALL_DIMENSIONS.forEach((dim, i) => {
      vector[dim] = arr[i] ?? 0;
    });
  }

  return vector;
}
