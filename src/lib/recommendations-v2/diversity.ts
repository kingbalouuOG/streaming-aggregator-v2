/**
 * Recommendations V2 — Diversity & De-clustering
 *
 * Post-scoring passes that enforce visual diversity within rows:
 *
 * 1. Genre spread (with taste-cluster secondary signal)
 * 2. Cross-service positional de-clustering
 * 3. Content-mix ratio resampling
 *
 * These implement the brief's 10% diversity + 10% cross-service spread budget
 * as post-processing stages rather than scoring components.
 */

import { TASTE_CLUSTERS } from '@/lib/taste-v2/tasteClusters';
import type { ScoredCandidate, ExtendedTitleRow } from './types';
import type { EmbeddingMap, CachedEmbedding } from './embeddingCache';
import { MAX_CONSECUTIVE_SAME_SERVICE } from './weights';

// ── Taste Cluster Mapping (precomputed) ──

/**
 * Map TMDb genre ID → best-matching taste cluster ID.
 *
 * Tiebreak rule: when a genre ID appears in multiple clusters' tmdbGenreIds,
 * the genre is assigned to the FIRST cluster in the TASTE_CLUSTERS array
 * where it appears. TASTE_CLUSTERS is ordered by display priority (most
 * universally appealing first), so ties favor broader clusters.
 *
 * Example: genre 878 (Sci-Fi) appears in both "Epic Sci-Fi & Fantasy" and
 * potentially other clusters. It maps to whichever lists it first in the array.
 *
 * This is deterministic and inspectable: the mapping is precomputed at module
 * load. To verify, log genreToClusterMap entries during Task 5 testing.
 */
const genreToClusterMap = buildGenreToClusterMap();

function buildGenreToClusterMap(): Map<number, string> {
  const map = new Map<number, string>();
  for (const cluster of TASTE_CLUSTERS) {
    for (const genreId of cluster.tmdbGenreIds) {
      // First-match wins: earlier clusters in TASTE_CLUSTERS take priority
      if (!map.has(genreId)) {
        map.set(genreId, cluster.id);
      }
    }
  }
  return map;
}

/** Get the taste cluster ID for a title based on its primary genre */
function getTasteCluster(meta: ExtendedTitleRow): string | null {
  const primaryGenre = (meta.genre_ids || [])[0];
  if (!primaryGenre) return null;
  return genreToClusterMap.get(primaryGenre) ?? null;
}

// ── Genre Spread ──

/**
 * Apply two-level genre diversity to a ranked candidate list.
 *
 * Primary signal: TMDb primary genre ID — no same primary genre within the
 * last `genreWindow` picks.
 *
 * Secondary signal: taste cluster assignment — catches within-genre redundancy
 * that raw genre IDs miss (e.g., "Cerebral Sci-Fi" vs "Epic Sci-Fi & Fantasy"
 * are both genre 878 but different clusters).
 *
 * @param candidates  Scored candidates in rank order (best first)
 * @param genreWindow How many recent picks to check for genre repeats (1–5)
 * @param maxPerGenre Maximum total titles sharing the same primary genre
 * @param limit       Max titles to select
 */
export function applyGenreSpread(
  candidates: ScoredCandidate[],
  genreWindow: number,
  maxPerGenre: number,
  limit: number,
): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const genreCounts = new Map<number, number>();
  const recentGenres: number[] = [];       // sliding window of primary genres
  const recentClusters: string[] = [];     // sliding window of taste clusters

  for (const candidate of candidates) {
    if (selected.length >= limit) break;

    const primaryGenre = (candidate.meta.genre_ids || [])[0] ?? -1;
    const cluster = getTasteCluster(candidate.meta);

    // Check genre cap
    if (primaryGenre !== -1 && (genreCounts.get(primaryGenre) ?? 0) >= maxPerGenre) {
      continue;
    }

    // Check genre window (primary)
    const recentGenreSlice = recentGenres.slice(-genreWindow);
    if (primaryGenre !== -1 && recentGenreSlice.includes(primaryGenre)) {
      continue;
    }

    // Check cluster window (secondary) — only if same primary genre isn't already blocking
    // This catches cases where two different genre IDs map to the same taste cluster
    if (cluster) {
      const recentClusterSlice = recentClusters.slice(-genreWindow);
      if (recentClusterSlice.includes(cluster)) {
        // Allow if it's a different primary genre (cross-genre cluster overlap is fine)
        // Block only if it's also the same cluster in the window
        const lastSameClusterIdx = recentClusters.lastIndexOf(cluster);
        if (lastSameClusterIdx >= 0 && lastSameClusterIdx >= recentClusters.length - genreWindow) {
          // Same cluster in window — skip if this would create a run of same-cluster content
          const clusterRunCount = recentClusterSlice.filter(c => c === cluster).length;
          if (clusterRunCount >= 2) continue;
        }
      }
    }

    // Accept this candidate
    selected.push(candidate);
    if (primaryGenre !== -1) {
      genreCounts.set(primaryGenre, (genreCounts.get(primaryGenre) ?? 0) + 1);
    }
    recentGenres.push(primaryGenre);
    recentClusters.push(cluster ?? '');
  }

  return selected;
}

// ── Phase 5: Maximal Marginal Relevance (MMR) ──

/**
 * MMR partial-coverage bail thresholds (IN-PX-23). When MMR runs against
 * a candidate pool with mostly-missing embeddings (e.g. Hidden Gems or
 * Outside Your Usual, where unembedded back-catalogue titles outnumber
 * embedded ones), the algorithm degenerates: redundancy collapses to 0
 * for most pairs and selection devolves to pure-finalScore order, which
 * silently produces same-genre clusters. Bailing out lets the caller
 * fall through to applyGenreSpread for these low-coverage rows.
 *
 * Tuning: if observability data shows over- or under-bailing during the
 * first week of prototype use, adjust here (one-line change).
 */
const MMR_NULL_RATIO_BAIL = 0.5;
const MMR_MIN_SAMPLE = 4;

/**
 * Cosine similarity between two cached embeddings. Norms are precomputed
 * at cache-population time so the inner loop skips a per-call
 * Math.sqrt — Phase 5.5 IN-PX-24 perf change (~3× MMR hot loop speedup).
 */
function cosineSimilarity(a: CachedEmbedding, b: CachedEmbedding): number {
  const denom = a.norm * b.norm;
  if (denom === 0) return 0;
  let dot = 0;
  const n = Math.min(a.vec.length, b.vec.length);
  for (let i = 0; i < n; i++) {
    dot += a.vec[i] * b.vec[i];
  }
  return dot / denom;
}

/**
 * Greedy Maximal Marginal Relevance over scored candidates.
 *
 * MMR balances relevance (finalScore) against intra-row redundancy
 * (cosine similarity to already-selected items). λ controls the
 * tradeoff: λ=1 returns top-finalScore (no diversification), λ=0
 * picks for maximum diversity regardless of relevance.
 *
 * The Adventure↔Comfort slider maps to λ via getMMRLambda
 * (weights.ts:99-101): λ=0.85 at full Comfort, λ=0.55 at full
 * Adventure, default 0.7 at midpoint.
 *
 * Embeddings come from `embeddingMap` keyed by contentKey
 * ("media_type-tmdb_id"). Candidates without an embedding entry are
 * still selectable — their redundancy contribution is treated as 0
 * (neutral). This keeps the algorithm robust against partial
 * embedding coverage.
 *
 * Replaces applyGenreSpread for intra-row diversity (brief §3.5 +
 * §4.4). Cross-service de-clustering still runs as a post-MMR pass.
 */
export interface MMRResult {
  selected: ScoredCandidate[];
  /** True when MMR exited early due to too many null-embedding picks
   *  (IN-PX-23). Caller should fall through to applyGenreSpread. */
  bailedOut: boolean;
}

export function applyMMR(
  candidates: ScoredCandidate[],
  embeddingMap: EmbeddingMap,
  opts: { lambda: number; k: number },
): MMRResult {
  if (candidates.length === 0) return { selected: [], bailedOut: false };
  const k = Math.min(opts.k, candidates.length);
  if (k === 0) return { selected: [], bailedOut: false };

  // Start from the highest-finalScore candidate.
  const remaining = [...candidates].sort((a, b) => b.finalScore - a.finalScore);
  const selected: ScoredCandidate[] = [remaining.shift()!];

  // Cache embeddings looked up so far to avoid repeated map.get() in
  // the inner loop. Only the SELECTED candidates' embeddings drive
  // redundancy; the candidates being scored just need their own.
  const selectedEmbeddings: Array<CachedEmbedding | null> = [
    embeddingMap.get(selected[0].contentKey) ?? null,
  ];
  let nullCount = selectedEmbeddings[0] === null ? 1 : 0;

  while (selected.length < k && remaining.length > 0) {
    // IN-PX-23 partial-coverage bail. Once we have enough samples to be
    // confident, exit early if too many picks have null embeddings —
    // MMR loses its diversity signal in that regime.
    if (
      selected.length >= MMR_MIN_SAMPLE &&
      nullCount / selected.length > MMR_NULL_RATIO_BAIL
    ) {
      console.debug(
        `[MMR] partial-coverage bail at ${selected.length} picks ` +
        `(${nullCount} null embeddings); caller will fall through to applyGenreSpread.`,
      );
      return { selected, bailedOut: true };
    }

    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const cEmb = embeddingMap.get(c.contentKey);

      // Redundancy = max cosine similarity to any already-selected item.
      // Missing embedding → 0 (neutral, doesn't penalise selection).
      let maxRedundancy = 0;
      if (cEmb) {
        for (const sEmb of selectedEmbeddings) {
          if (!sEmb) continue;
          const sim = cosineSimilarity(cEmb, sEmb);
          if (sim > maxRedundancy) maxRedundancy = sim;
        }
      }

      const mmrScore = opts.lambda * c.finalScore - (1 - opts.lambda) * maxRedundancy;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    const picked = remaining.splice(bestIdx, 1)[0];
    selected.push(picked);
    const pickedEmb = embeddingMap.get(picked.contentKey) ?? null;
    selectedEmbeddings.push(pickedEmb);
    if (pickedEmb === null) nullCount++;
  }

  return { selected, bailedOut: false };
}

// ── Cross-Service De-clustering ──

/**
 * Positional de-clustering: no more than MAX_CONSECUTIVE_SAME_SERVICE (2)
 * consecutive titles from the same streaming service.
 *
 * Per brief §3.6: "global service balancing would produce distorted results
 * when a user's catalogue is genuinely dominated by one service. Positional
 * de-clustering only prevents visual monotony."
 *
 * @param candidates  Ranked candidates (post genre-spread)
 * @param getServices Function to look up service IDs for a tmdb_id
 */
export function deClusterByService(
  candidates: ScoredCandidate[],
  getServices: (tmdbId: number, mediaType: string) => string[],
): ScoredCandidate[] {
  if (candidates.length <= MAX_CONSECUTIVE_SAME_SERVICE) return [...candidates];

  const result = [...candidates];
  const maxConsecutive = MAX_CONSECUTIVE_SAME_SERVICE;

  for (let i = maxConsecutive; i < result.length; i++) {
    const currentServices = new Set(getServices(result[i].tmdbId, result[i].mediaType));

    // Check if the last `maxConsecutive` items share a service with this one
    let allSameService = true;
    for (let j = 1; j <= maxConsecutive; j++) {
      const prevServices = getServices(result[i - j].tmdbId, result[i - j].mediaType);
      const hasOverlap = prevServices.some(s => currentServices.has(s));
      if (!hasOverlap) {
        allSameService = false;
        break;
      }
    }

    if (!allSameService) continue;

    // Find the next item with a different primary service to swap with.
    // Check against the full preceding window to avoid introducing a new cluster.
    for (let k = i + 1; k < result.length; k++) {
      const swapServices = new Set(getServices(result[k].tmdbId, result[k].mediaType));
      let wouldCluster = false;
      for (let j = 1; j <= maxConsecutive && i - j >= 0; j++) {
        const prevServices = getServices(result[i - j].tmdbId, result[i - j].mediaType);
        if (prevServices.some(s => swapServices.has(s))) {
          wouldCluster = true;
          break;
        }
      }

      if (!wouldCluster) {
        [result[i], result[k]] = [result[k], result[i]];
        break;
      }
    }
  }

  return result;
}

// ── Content Mix Resampling ──

/**
 * Post-retrieval resampling to enforce movie/TV ratio from Content-mix slider.
 *
 * Per brief §3.1: "apply as a post-retrieval resampling step rather than
 * filtering inside the RPC, since the RPC returns by cosine similarity and
 * doesn't know about media_type ratios."
 *
 * At movieRatio ≈ 0.5 (±0.05), no filtering is applied (natural distribution).
 *
 * @param candidates  All candidates from Stage 1
 * @param movieRatio  Target fraction of movies (0.2–0.8)
 */
export function applyContentMixRatio(
  candidates: ScoredCandidate[],
  movieRatio: number,
): ScoredCandidate[] {
  // Skip resampling if ratio is near 50/50
  if (movieRatio >= 0.45 && movieRatio <= 0.55) return candidates;

  const movies = candidates.filter(c => c.mediaType === 'movie');
  const tvShows = candidates.filter(c => c.mediaType === 'tv');

  const totalTarget = candidates.length;
  const movieTarget = Math.round(totalTarget * movieRatio);
  const tvTarget = totalTarget - movieTarget;

  // Take up to target count from each, preserving rank order
  const selectedMovies = movies.slice(0, movieTarget);
  const selectedTV = tvShows.slice(0, tvTarget);

  // Interleave: maintain roughly the target ratio while preserving relative ordering
  const result: ScoredCandidate[] = [];
  let mi = 0;
  let ti = 0;
  let movieCount = 0;

  while (mi < selectedMovies.length || ti < selectedTV.length) {
    const currentMovieRatio = result.length === 0 ? 0 : movieCount / result.length;

    if (mi < selectedMovies.length && (ti >= selectedTV.length || currentMovieRatio < movieRatio)) {
      result.push(selectedMovies[mi++]);
      movieCount++;
    } else if (ti < selectedTV.length) {
      result.push(selectedTV[ti++]);
    } else {
      break;
    }
  }

  return result;
}
