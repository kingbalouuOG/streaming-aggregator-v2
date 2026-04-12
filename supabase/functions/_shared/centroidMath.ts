/**
 * Centroid Math (Shared Module)
 *
 * Pure functions for computing centroids and cosine similarity on embedding
 * vectors. No I/O, no Supabase, no fetch — isomorphic TS that runs
 * identically in Node.js scripts and Deno Edge Functions.
 *
 * Extracted from scripts/embeddings/eval-cluster-coherence.ts (lines 96-133).
 *
 * Imported by:
 *   - scripts/fingerprints/build-service-fingerprints.ts (Node.js)
 *   - scripts/fingerprints/eval-service-discrimination.ts (Node.js)
 *   - supabase/functions/refresh-service-fingerprints/index.ts (Deno)
 */

/**
 * Element-wise mean of N vectors. All must have the same dimensionality.
 * Returns the raw (unnormalised) centroid — pgvector's <=> cosine distance
 * operator normalises internally, so storing unnormalised centroids is correct.
 */
export function computeCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error('computeCentroid: cannot compute centroid of zero vectors');
  }
  const dim = vectors[0].length;
  const result = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) result[i] += v[i];
  }
  for (let i = 0; i < dim; i++) result[i] /= vectors.length;
  return result;
}

/**
 * Cosine similarity between two vectors of equal length.
 * Returns 0 if either vector has zero magnitude.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * L2 (Euclidean) norm of a vector.
 */
export function l2Norm(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}
