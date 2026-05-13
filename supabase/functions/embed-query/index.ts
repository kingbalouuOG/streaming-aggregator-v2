/**
 * embed-query — Phase Search V2 Cluster B (B2).
 *
 * Embeds a user-typed search query via OpenAI text-embedding-3-small
 * so the client can call `match_titles_by_vector` for semantic search.
 * In-memory LRU cache by normalised query string, ~1h TTL, ~1000
 * entries — the same query typed twice within an hour skips the
 * OpenAI round-trip.
 *
 * JWT-protected. Anonymous callers get 401. The cost model in the
 * strategy annex §8 assumes only authenticated traffic — gating here
 * is the enforcement.
 *
 * Deploy:
 *   npx supabase functions deploy embed-query --project-ref fmusugdcnnwiuzkbjquo
 *
 * Request:  POST /  { "query": "lonely cowboys" }
 * Response: 200    { "embedding": number[1536], "cached": boolean }
 *           401    { "error": "Unauthorized" }
 *           400    { "error": "Missing or invalid query" }
 *           500    { "error": "Embedding failed" }
 */

import { embedSingle } from '../_shared/openaiEmbeddings.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { extractUserIdFromJwt } from '../_shared/userScope.ts';

// ── LRU cache ──────────────────────────────────────────────────────
//
// Map maintains insertion order in JS engines, so a delete-then-set on
// every hit is a cheap LRU promotion. Cap at MAX_ENTRIES; evict the
// oldest when full. TTL guards against stale embeddings if the model
// is ever swapped without code change.

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 1000;

interface CacheEntry {
  embedding: number[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function normaliseQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheGet(key: string): number[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // LRU promotion: re-insert at the end of iteration order.
  cache.delete(key);
  cache.set(key, entry);
  return entry.embedding;
}

function cacheSet(key: string, embedding: number[]): void {
  if (cache.size >= MAX_ENTRIES) {
    // Evict the oldest entry (first key in iteration order).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { embedding, expiresAt: Date.now() + TTL_MS });
}

// ── Handler ────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // JWT check — config.toml gates this at the gateway via verify_jwt,
  // but extracting here defends against any future verify_jwt=false
  // toggle and lets us surface a clean 401 body.
  const userId = extractUserIdFromJwt(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const rawQuery = typeof body.query === 'string' ? body.query : '';
  const normalised = normaliseQuery(rawQuery);
  // Bound query length — protects the cache + OpenAI bill from a
  // pathological caller dumping a paragraph into the search box. 200
  // chars is well above any real search query.
  if (normalised.length === 0 || normalised.length > 200) {
    return new Response(JSON.stringify({ error: 'Missing or invalid query' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Cache hit
  const cached = cacheGet(normalised);
  if (cached) {
    return new Response(JSON.stringify({ embedding: cached, cached: true }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Cache miss — embed
  // deno-lint-ignore no-explicit-any
  const apiKey = (globalThis as any).Deno?.env?.get('OPENAI_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Embedding service not configured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await embedSingle(normalised, apiKey);
    if (!result || !Array.isArray(result.embedding)) {
      return new Response(JSON.stringify({ error: 'Embedding failed' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    cacheSet(normalised, result.embedding);
    return new Response(JSON.stringify({ embedding: result.embedding, cached: false }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[embed-query] embedSingle failed:', err);
    return new Response(JSON.stringify({ error: 'Embedding failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
