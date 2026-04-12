/**
 * Embed New Titles Edge Function (Phase 1)
 *
 * Ongoing embedding of newly enriched titles. Runs daily at 06:45 UTC,
 * 15 minutes after enrich-new-titles (06:30), so titles that were synced
 * (06:00) and enriched (06:30) flow into embeddings the same day.
 *
 * Work queue: WHERE embedding IS NULL AND keywords IS NOT NULL
 *   - keywords IS NOT NULL ensures only enriched rows are embedded
 *   - The 7 TMDb-404 rows with NULL keywords are excluded
 *
 * Deploy: npx supabase functions deploy embed-new-titles --project-ref fmusugdcnnwiuzkbjquo
 * Manual: curl -X POST https://<project>.supabase.co/functions/v1/embed-new-titles \
 *           -H "Authorization: Bearer <service_role_key>"
 *
 * Required Supabase Functions env vars (set via `supabase secrets set`):
 *   - SUPABASE_URL                (auto-provided)
 *   - SUPABASE_SERVICE_ROLE_KEY   (auto-provided)
 *   - OPENAI_API_KEY              (must be set explicitly)
 *
 * Per-invocation budget: 100 rows. At ~100ms per OpenAI call this is
 * ~10 s, well under the 2-minute Edge Function timeout.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmbeddingText } from '../_shared/embeddingTemplate.ts';
import { embedSingle } from '../_shared/openaiEmbeddings.ts';

// ── Config ───────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BATCH_LIMIT = 100; // max rows embedded per invocation

// ── Types ────────────────────────────────────────────────

interface TitleRow {
  id: number;
  tmdb_id: number;
  title: string;
  release_year: number;
  media_type: 'movie' | 'tv';
  genre_ids: number[];
  overview: string | null;
  keywords: string[];
  cast_top_5: string[];
  runtime: number | null;
}

interface RunStats {
  processed: number;
  failed: number;
  remaining: number;
  total_tokens: number;
}

// ── Core ─────────────────────────────────────────────────

async function runEmbeddingBatch(): Promise<RunStats> {
  const stats: RunStats = { processed: 0, failed: 0, remaining: 0, total_tokens: 0 };

  const { data: rows, error } = await supabase
    .from('titles')
    .select('id, tmdb_id, title, release_year, media_type, genre_ids, overview, keywords, cast_top_5, runtime')
    .is('embedding', null)
    .not('keywords', 'is', null)
    .order('id', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    throw new Error(`Supabase select failed: ${error.message}`);
  }

  const queue = (rows ?? []) as TitleRow[];
  console.log(`embed-new-titles: processing ${queue.length} rows (cap ${BATCH_LIMIT})`);

  for (const row of queue) {
    try {
      const text = buildEmbeddingText({
        title: row.title,
        release_year: row.release_year,
        media_type: row.media_type,
        genre_ids: row.genre_ids ?? [],
        overview: row.overview,
        keywords: row.keywords ?? [],
        cast_top_5: row.cast_top_5 ?? [],
        runtime: row.runtime,
      });

      const result = await embedSingle(text, OPENAI_API_KEY, { delayMs: 50, maxRetries: 3 });

      if (!result) {
        stats.failed++;
        console.error(`  fail  ${row.media_type}/${row.tmdb_id}: OpenAI returned null`);
        continue;
      }

      const vectorStr = `[${result.embedding.join(',')}]`;
      const { error: updateError } = await supabase
        .from('titles')
        .update({ embedding: vectorStr })
        .eq('id', row.id);

      if (updateError) {
        throw new Error(`Supabase update failed: ${updateError.message}`);
      }

      stats.processed++;
      stats.total_tokens += result.token_count;
    } catch (err) {
      stats.failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  fail  ${row.media_type}/${row.tmdb_id}: ${message}`);
    }
  }

  // Report what's still pending
  const { count: remainingCount } = await supabase
    .from('titles')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)
    .not('keywords', 'is', null);
  stats.remaining = remainingCount ?? 0;

  return stats;
}

// ── Edge Function handler ────────────────────────────────

Deno.serve(async (req) => {
  // JWT verification — mirrors enrich-new-titles/index.ts
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const payload = JSON.parse(atob(authHeader.split(' ')[1].split('.')[1]));
    if (payload.role !== 'service_role') throw new Error('not service_role');
  } catch {
    return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const stats = await runEmbeddingBatch();
    console.log(
      `embed-new-titles done: processed=${stats.processed} failed=${stats.failed} remaining=${stats.remaining} tokens=${stats.total_tokens}`
    );
    return new Response(JSON.stringify({ status: 'ok', ...stats }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('embed-new-titles failed:', message);
    return new Response(JSON.stringify({ status: 'error', message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
