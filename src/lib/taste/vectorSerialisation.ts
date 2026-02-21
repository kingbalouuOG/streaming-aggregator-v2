/**
 * Vector Serialisation
 *
 * Converts between the app's named TasteVector (Record<Dimension, number>)
 * and the positional float4[25] array stored in Supabase.
 *
 * Uses ALL_DIMENSIONS as the canonical positional order — single source of truth.
 */

import { ALL_DIMENSIONS, type TasteVector, createEmptyVector } from './tasteVector';

/** Convert a named TasteVector to a positional array for Supabase float4[25] */
export function vectorToArray(vector: TasteVector): number[] {
  return ALL_DIMENSIONS.map(dim => vector[dim] ?? 0);
}

/** Convert a positional array from Supabase float4[25] to a named TasteVector */
export function arrayToVector(arr: number[]): TasteVector {
  const vector = createEmptyVector();
  ALL_DIMENSIONS.forEach((dim, i) => {
    vector[dim] = arr[i] ?? 0;
  });
  return vector;
}
