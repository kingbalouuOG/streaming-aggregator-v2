/**
 * OpenAI Embedding Client (Shared Module)
 *
 * Thin rate-limited wrapper around the OpenAI /v1/embeddings endpoint.
 * Model: text-embedding-3-small (1536 dimensions). Isomorphic — uses
 * fetch(), works in Node 18+ and Deno.
 *
 * Mirrors the tmdb-enrichment-client.ts shape:
 *   - Pre-request delay (rate-limit gate)
 *   - Exponential backoff on 429 / 5xx
 *   - Returns null on hard failure rather than throwing
 *   - Tracks token usage from response
 *
 * Imported by:
 *   - scripts/embeddings/backfill-embeddings.ts (Node.js bulk backfill)
 *   - supabase/functions/embed-new-titles/index.ts (Deno Edge Function)
 */

// ── Types ───────────────────────────────────────────────────────

export interface EmbeddingResult {
  embedding: number[];
  token_count: number;
}

export interface EmbeddingBatchResult {
  results: (EmbeddingResult | null)[];
  total_tokens: number;
}

// ── Constants ───────────────────────────────────────────────────

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small';

// ── Internals ───────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

/**
 * POST to the OpenAI embeddings endpoint with retry on 429/5xx.
 * Returns the parsed response or null on exhausted retries.
 */
async function fetchWithRetry(
  body: string,
  apiKey: string,
  maxRetries: number,
  delayMs: number,
): Promise<OpenAIEmbeddingResponse | null> {
  await delay(delayMs);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(OPENAI_EMBEDDINGS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });

      if (res.ok) {
        return (await res.json()) as OpenAIEmbeddingResponse;
      }

      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 2) * 1000; // 4s, 8s, 16s
        console.log(`  retry ${attempt + 1}/${maxRetries} after ${backoff}ms (HTTP ${res.status})`);
        await delay(backoff);
        continue;
      }

      // Non-retryable error
      const errText = await res.text().catch(() => '');
      console.error(`  OpenAI ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.log(`  retry ${attempt + 1}/${maxRetries} after ${backoff}ms (${err instanceof Error ? err.message : 'network error'})`);
        await delay(backoff);
        continue;
      }
      console.error(`  OpenAI network error after ${maxRetries} retries: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Embed a batch of texts. The OpenAI embeddings endpoint accepts an array
 * of inputs, returning one embedding per input in the same positional order.
 *
 * Returns null per-item on hard failure (array position preserved).
 * Returns null for the entire batch if the API call itself fails.
 */
export async function embedBatch(
  texts: string[],
  apiKey: string,
  options: { delayMs?: number; maxRetries?: number } = {},
): Promise<EmbeddingBatchResult | null> {
  const { delayMs = 100, maxRetries = 3 } = options;

  if (texts.length === 0) {
    return { results: [], total_tokens: 0 };
  }

  const body = JSON.stringify({ input: texts, model: MODEL });
  const response = await fetchWithRetry(body, apiKey, maxRetries, delayMs);

  if (!response) return null;

  // OpenAI returns data sorted by index, but sort to be safe
  const sorted = response.data.sort((a, b) => a.index - b.index);

  const results: (EmbeddingResult | null)[] = texts.map((_, i) => {
    const entry = sorted.find((d) => d.index === i);
    if (!entry) return null;
    return {
      embedding: entry.embedding,
      token_count: 0, // per-item tokens not available; total tracked below
    };
  });

  return {
    results,
    total_tokens: response.usage.total_tokens,
  };
}

/**
 * Embed a single text. Convenience wrapper around embedBatch.
 */
export async function embedSingle(
  text: string,
  apiKey: string,
  options: { delayMs?: number; maxRetries?: number } = {},
): Promise<EmbeddingResult | null> {
  const batch = await embedBatch([text], apiKey, options);
  if (!batch || !batch.results[0]) return null;
  return {
    embedding: batch.results[0].embedding,
    token_count: batch.total_tokens,
  };
}
