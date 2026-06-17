// semanticRetrieval — Phase Search V2 Cluster B (B3).
//
// Pure ranking module. Given a query embedding + optional user
// taste vector + optional filter constraints, fetches semantic
// candidates from `match_titles_by_vector`, scores them with the
// 60/25/15 weights from strategy annex §4, and returns the ranked
// list.
//
// PLAT-3: relocated from supabase/functions/_shared/ (where it was the
// one REVERSE-direction shared module — client importing from the Edge
// tree) into the engine tree as part of dissolving the ADR-011 mirror.
// The client adapter (./semanticRetrieval.ts) drives it; a server
// consumer can import it the same way the Worker imports the engine.
//
// What this module does NOT do:
//   - Embed the query. Caller provides the 1536D vector.
//   - Fetch user taste vector. Caller looks it up.
//   - Apply filter WHERE clauses inside the SQL. match_titles_by_vector
//     doesn't accept filter args; we post-filter on metadata.
//
// Weights are exported as named constants so the eval rig can tune
// them without code churn elsewhere.

/** Minimal structural client — one RPC + one table read. Keeps the
 *  eval rig free to pass a bare supabase-js client OR a stub. */
interface SupabaseResult {
  data: unknown;
  error: { message: string } | null;
}
interface SupabaseLike {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<SupabaseResult>;
  from(table: string): {
    select(columns: string): {
      in(column: string, values: readonly unknown[]): PromiseLike<SupabaseResult>;
    };
  };
}

export const WEIGHT_RELEVANCE = 0.60;
export const WEIGHT_TASTE = 0.25;
export const WEIGHT_RECENCY = 0.15;

export interface SemanticCandidateMeta {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  release_year: number | null;
  genre_ids: number[];
  original_language: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number | null;
  vote_count: number | null;
  popularity: number | null;
  runtime: number | null;
}

export interface ScoredSemanticCandidate {
  meta: SemanticCandidateMeta;
  /** Cosine similarity to the query embedding (0..1, higher better). */
  relevance: number;
  /** Cosine similarity to the user's taste vector (0..1). 0.5 when
   *  no taste vector supplied — neutral. */
  tasteFit: number;
  /** Recency component (0..1) — newer titles score higher with a
   *  soft floor for older catalogue. */
  recency: number;
  /** Weighted final score (0..1). */
  score: number;
}

export interface SemanticRetrievalOptions {
  /** Hard cap on the candidate pool fetched from the RPC. Defaults
   *  to 100 — generous so the post-filter has room. */
  candidateLimit?: number;
  /** Hard cap on the returned ranked list. Defaults to 40 — enough
   *  for two visible pages on the grid. */
  resultLimit?: number;
  /** Year now, used for the recency component. Caller can override
   *  for deterministic tests. */
  currentYear?: number;
}

/**
 * Run the semantic retrieval + ranking. See module docs for the
 * decision tree.
 */
export async function semanticRetrieval(
  client: SupabaseLike,
  queryEmbedding: number[],
  userTasteVector: number[] | null,
  postFilter: ((meta: SemanticCandidateMeta) => boolean) | null,
  options: SemanticRetrievalOptions = {},
): Promise<ScoredSemanticCandidate[]> {
  const {
    candidateLimit = 100,
    resultLimit = 40,
    currentYear = new Date().getFullYear(),
  } = options;

  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return [];
  }

  const vectorStr = `[${queryEmbedding.join(',')}]`;
  const { data: matched, error: rpcError } = await client.rpc('match_titles_by_vector', {
    query_vector: vectorStr,
    match_limit: candidateLimit,
  });
  if (rpcError || !matched || !Array.isArray(matched)) {
    return [];
  }

  // Distance is cosine distance (0..2 for normalised vectors, but
  // pgvector's <=> returns 0..2). Convert to similarity in 0..1:
  // similarity = 1 - distance/2 keeps the relationship monotonic
  // and well-bounded.
  // Key by (tmdb_id, media_type): titles.tmdb_id is NOT unique — a movie and
  // a TV title can share an id but are distinct rows with different
  // embeddings, so keying on tmdb_id alone cross-wires their distances +
  // taste-fit and emits a phantom wrong-media-type candidate.
  const distancesByKey = new Map<string, number>();
  const idsForMeta: Array<{ tmdb_id: number; media_type: string }> = [];
  for (const row of matched as Array<{ tmdb_id: number; media_type: string; distance: number }>) {
    distancesByKey.set(`${row.tmdb_id}:${row.media_type}`, row.distance);
    idsForMeta.push({ tmdb_id: row.tmdb_id, media_type: row.media_type });
  }
  if (idsForMeta.length === 0) return [];

  // Batch-fetch metadata + embedding for the candidate set. Embedding
  // is needed for taste-fit scoring; metadata for the post-filter
  // and for surfacing back to the renderer.
  const candidateIds = idsForMeta.map((r) => r.tmdb_id);
  const { data: rows, error: metaError } = await client
    .from('titles')
    .select('tmdb_id, media_type, title, release_year, genre_ids, original_language, poster_path, backdrop_path, vote_average, vote_count, popularity, runtime, embedding')
    .in('tmdb_id', candidateIds);
  if (metaError || !rows) return [];

  const scored: ScoredSemanticCandidate[] = [];
  for (const row of rows as Array<SemanticCandidateMeta & { embedding: unknown }>) {
    // .in('tmdb_id', …) can return the sibling media_type for a colliding id;
    // skip any (id, media_type) that wasn't an actual vector match.
    const dist = distancesByKey.get(`${row.tmdb_id}:${row.media_type}`);
    if (dist === undefined) continue;
    const meta: SemanticCandidateMeta = {
      tmdb_id: row.tmdb_id,
      media_type: row.media_type,
      title: row.title,
      release_year: row.release_year ?? null,
      genre_ids: Array.isArray(row.genre_ids) ? row.genre_ids : [],
      original_language: row.original_language ?? null,
      poster_path: row.poster_path ?? null,
      backdrop_path: row.backdrop_path ?? null,
      vote_average: row.vote_average ?? null,
      vote_count: row.vote_count ?? null,
      popularity: row.popularity ?? null,
      runtime: row.runtime ?? null,
    };
    if (postFilter && !postFilter(meta)) continue;

    const relevance = clamp01(1 - dist / 2);

    // Taste fit. When no taste vector supplied (logged-out / pre-
    // onboarding), use a neutral 0.5 — the relevance + recency
    // components still discriminate.
    let tasteFit = 0.5;
    if (userTasteVector && userTasteVector.length > 0) {
      const itemEmbedding = parseEmbedding(row.embedding);
      if (itemEmbedding) {
        tasteFit = clamp01(cosineSimilarity(userTasteVector, itemEmbedding));
      }
    }

    const recency = computeRecency(meta.release_year, currentYear);

    const score =
      WEIGHT_RELEVANCE * relevance +
      WEIGHT_TASTE * tasteFit +
      WEIGHT_RECENCY * recency;

    scored.push({ meta, relevance, tasteFit, recency, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, resultLimit);
}

// ── Helpers ────────────────────────────────────────────────────────

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

function parseEmbedding(raw: unknown): number[] | null {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) return raw as number[];
  return null;
}

/**
 * Recency score in 0..1 — newer wins, but with a soft floor so
 * older catalogue isn't crushed entirely. Titles before 1960 score
 * 0; everything else slides linearly to 1 at the current year.
 */
function computeRecency(year: number | null, currentYear: number): number {
  if (!year || year < 1960) return 0;
  if (year >= currentYear) return 1;
  return (year - 1960) / (currentYear - 1960);
}
