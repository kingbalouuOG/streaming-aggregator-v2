/**
 * Taste Vector V2 — Vector Operations
 *
 * Pure functions on number[] arrays (1536D).
 * No side effects, no I/O.
 */

/** Compute element-wise mean of multiple vectors */
export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const result = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      result[i] += v[i];
    }
  }
  const n = vectors.length;
  for (let i = 0; i < dim; i++) {
    result[i] /= n;
  }
  return result;
}

/** Compute weighted sum of vectors (not normalised) */
export function weightedSum(vectors: number[][], weights: number[]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const result = new Array(dim).fill(0);
  for (let j = 0; j < vectors.length; j++) {
    const w = weights[j];
    const v = vectors[j];
    for (let i = 0; i < dim; i++) {
      result[i] += w * v[i];
    }
  }
  return result;
}

/** Cosine similarity between two vectors. Returns value in [0, 1] (clamped). */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  // Map from [-1, 1] to [0, 1]
  return Math.max(0, Math.min(1, (dot / denom + 1) / 2));
}

/** Raw cosine similarity without clamping to [0,1]. Returns [-1, 1]. */
export function rawCosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

/** L2 normalise a vector (unit length). Returns zero vector if input is zero. */
export function l2Normalise(v: number[]): number[] {
  let mag = 0;
  for (let i = 0; i < v.length; i++) {
    mag += v[i] * v[i];
  }
  mag = Math.sqrt(mag);
  if (mag === 0) return v.slice();
  return v.map(x => x / mag);
}

/** Blend current vector toward target by alpha (exponential moving average) */
export function blendToward(current: number[], target: number[], alpha: number): number[] {
  return current.map((c, i) => c + alpha * (target[i] - c));
}

/** Blend current vector away from target by alpha */
export function blendAway(current: number[], target: number[], alpha: number): number[] {
  return current.map((c, i) => c - alpha * (target[i] - c));
}

/** Add a scaled vector to another */
export function addScaled(base: number[], addition: number[], scale: number): number[] {
  return base.map((b, i) => b + scale * addition[i]);
}

/** Check if a vector is all zeros */
export function isZeroVector(v: number[]): boolean {
  return v.every(x => x === 0);
}
