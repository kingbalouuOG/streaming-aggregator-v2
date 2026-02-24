/**
 * Taste Vector Model
 *
 * 24-dimensional preference vector:
 * - 19 genre dimensions (0.0 to 1.0) — how much the user likes each genre
 * - 5 meta dimensions (-1.0 to +1.0) — cross-genre preference axes
 *
 * User vectors use continuous values; content vectors use binary genre values (1.0/0.0).
 * Cosine similarity handles this asymmetry correctly.
 */

// ── Genre dimension keys (match TMDb genre mapping) ─────────────
export const GENRE_DIMENSIONS = [
  'action', 'adventure', 'animation', 'comedy', 'crime',
  'documentary', 'drama', 'family', 'fantasy', 'history', 'horror',
  'musical', 'mystery', 'reality', 'romance', 'scifi', 'thriller',
  'war', 'western',
] as const;

// ── Meta dimension keys ─────────────────────────────────────────
export const META_DIMENSIONS = [
  'tone',       // -1 = dark/intense/gritty    → +1 = light/fun/uplifting
  'pacing',     // -1 = slow burn/contemplative → +1 = fast/high-energy
  'era',        // -1 = classic/period          → +1 = modern/contemporary
  'popularity', // -1 = indie/niche/arthouse    → +1 = mainstream/blockbuster
  'intensity',  // -1 = cerebral/understated    → +1 = visceral/high-stakes
] as const;

export const ALL_DIMENSIONS = [...GENRE_DIMENSIONS, ...META_DIMENSIONS] as const;

export type GenreDimension = typeof GENRE_DIMENSIONS[number];
export type MetaDimension = typeof META_DIMENSIONS[number];
export type Dimension = typeof ALL_DIMENSIONS[number];

// ── TasteVector type ────────────────────────────────────────────
export type TasteVector = Record<Dimension, number>;

// ── Similarity weights per dimension (for weighted cosine) ──────
export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
  // Genre dimensions: 1.0 each (primary signal)
  action: 1.0, adventure: 1.0, animation: 1.0,
  comedy: 1.0, crime: 1.0, documentary: 1.0, drama: 1.0,
  family: 1.0, fantasy: 1.0, history: 1.0, horror: 1.0,
  musical: 1.0, mystery: 1.0, reality: 1.0, romance: 1.0,
  scifi: 1.0, thriller: 1.0, war: 1.0, western: 1.0,
  // Meta dimensions: weighted by signal strength
  tone: 0.8,
  pacing: 0.6,
  era: 0.4,
  popularity: 0.5,
  intensity: 0.7,
};

// ── Factory ─────────────────────────────────────────────────────

/** Create a zero vector (all dimensions at 0) */
export function createEmptyVector(): TasteVector {
  const v = {} as TasteVector;
  for (const d of ALL_DIMENSIONS) v[d] = 0;
  return v;
}

/**
 * Create an initial vector from onboarding genre selections.
 * Selected genres → 0.5, unselected → 0.2, meta → 0.0
 */
export function createDefaultVector(selectedGenres: string[]): TasteVector {
  const v = createEmptyVector();
  const selected = new Set(selectedGenres.map((g) => genreNameToKey(g)));

  for (const dim of GENRE_DIMENSIONS) {
    v[dim] = selected.has(dim) ? 0.5 : 0.25;
  }
  // Meta dimensions stay at 0.0 (neutral)
  return v;
}

// ── Clamping ────────────────────────────────────────────────────

/** Clamp vector to valid ranges: genres [0,1], meta [-1,1] */
export function clampVector(v: TasteVector): TasteVector {
  const out = { ...v };
  for (const d of GENRE_DIMENSIONS) {
    out[d] = Math.max(0, Math.min(1, out[d]));
  }
  for (const d of META_DIMENSIONS) {
    out[d] = Math.max(-1, Math.min(1, out[d]));
  }
  return out;
}

// ── Vector math ─────────────────────────────────────────────────

/** Weighted cosine similarity (0–100 scale) */
export function cosineSimilarity(
  a: TasteVector,
  b: TasteVector,
  weights: Record<Dimension, number> = DIMENSION_WEIGHTS
): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const d of ALL_DIMENSIONS) {
    const w = weights[d];
    const wa = a[d] * w;
    const wb = b[d] * w;
    dotProduct += wa * wb;
    magA += wa * wa;
    magB += wb * wb;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  // Cosine similarity is [-1, 1]; map to [0, 100]
  const raw = dotProduct / denom;
  return Math.round(((raw + 1) / 2) * 100);
}

/**
 * Blend current vector toward a target by weight.
 * Used for continuous learning updates.
 * Formula: current[d] += weight * learningRate * (target[d] - current[d])
 */
export function blendVector(
  current: TasteVector,
  target: TasteVector,
  weight: number,
  learningRate = 0.1
): TasteVector {
  const out = { ...current };
  for (const d of ALL_DIMENSIONS) {
    out[d] += weight * learningRate * (target[d] - current[d]);
  }
  return clampVector(out);
}

/**
 * Blend away from a target (for negative signals like thumbs-down).
 * Formula: current[d] += weight * learningRate * (current[d] - target[d])
 */
export function blendVectorAway(
  current: TasteVector,
  target: TasteVector,
  weight: number,
  learningRate = 0.1
): TasteVector {
  const out = { ...current };
  for (const d of ALL_DIMENSIONS) {
    out[d] += weight * learningRate * (out[d] - target[d]);
  }
  return clampVector(out);
}

/** Add a delta vector scaled by weight: out = base + delta * weight */
export function addScaledDelta(
  base: TasteVector,
  delta: TasteVector,
  weight: number
): TasteVector {
  const out = { ...base };
  for (const d of ALL_DIMENSIONS) {
    out[d] += delta[d] * weight;
  }
  return clampVector(out);
}

/** Get the top N genre dimensions by score */
export function getTopGenres(vector: TasteVector, count = 3): GenreDimension[] {
  return [...GENRE_DIMENSIONS]
    .sort((a, b) => vector[b] - vector[a])
    .slice(0, count);
}

// ── Homepage genre section constants ─────────────────────────────

export const GENRE_MIN_THRESHOLD = 0.1;
export const IMMEDIATE_LOAD_COUNT = 5;

/** Get all genre dimensions scoring above threshold, ordered by score descending */
export function getGenresFromVector(
  vector: TasteVector,
  minThreshold = GENRE_MIN_THRESHOLD
): GenreDimension[] {
  return [...GENRE_DIMENSIONS]
    .filter((dim) => vector[dim] > minThreshold)
    .sort((a, b) => vector[b] - vector[a]);
}

/** Check if vector has any non-zero values */
export function isNonZero(v: TasteVector): boolean {
  return ALL_DIMENSIONS.some((d) => v[d] !== 0);
}

// ── Genre name ↔ vector key mapping ─────────────────────────────

const NAME_TO_KEY: Record<string, GenreDimension> = {
  'Action': 'action', 'Adventure': 'adventure', 'Animation': 'animation',
  'Comedy': 'comedy', 'Crime': 'crime',
  'Documentary': 'documentary', 'Drama': 'drama', 'Family': 'family',
  'Fantasy': 'fantasy', 'History': 'history', 'Horror': 'horror',
  'Musical': 'musical', 'Music': 'musical', // backwards compat
  'Mystery': 'mystery', 'Reality': 'reality', 'Romance': 'romance',
  'Sci-Fi': 'scifi', 'Thriller': 'thriller', 'War': 'war', 'Western': 'western',
};

const KEY_TO_NAME: Record<GenreDimension, string> = {
  action: 'Action', adventure: 'Adventure', animation: 'Animation',
  comedy: 'Comedy', crime: 'Crime',
  documentary: 'Documentary', drama: 'Drama', family: 'Family',
  fantasy: 'Fantasy', history: 'History', horror: 'Horror',
  musical: 'Musical', mystery: 'Mystery', reality: 'Reality',
  romance: 'Romance', scifi: 'Sci-Fi', thriller: 'Thriller',
  war: 'War', western: 'Western',
};

export function genreNameToKey(name: string): GenreDimension {
  return NAME_TO_KEY[name] || (name.toLowerCase() as GenreDimension);
}

export function genreKeyToName(key: GenreDimension): string {
  return KEY_TO_NAME[key] || key;
}
