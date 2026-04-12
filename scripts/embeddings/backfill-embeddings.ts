/**
 * Phase 1 Content Embedding Backfill
 *
 * One-time bulk script that generates 1536D OpenAI text-embedding-3-small
 * embeddings for every enriched title in `titles` and stores them in the
 * `embedding vector(1536)` column (migration 018).
 *
 * Runs from a developer laptop (NOT an Edge Function — no timeout
 * pressure). Resume-safe by construction: the work-queue query is
 * `WHERE embedding IS NULL AND keywords IS NOT NULL`, so re-running
 * picks up wherever the last run stopped. The .checkpoint.json is a
 * human-readable progress marker, not the source of truth.
 *
 * Usage:
 *   npx tsx scripts/embeddings/backfill-embeddings.ts                # full run
 *   npx tsx scripts/embeddings/backfill-embeddings.ts --limit 50     # process at most 50 rows
 *   npx tsx scripts/embeddings/backfill-embeddings.ts --dry-run      # build text but don't embed/UPDATE
 *   npx tsx scripts/embeddings/backfill-embeddings.ts --limit 10 --dry-run
 *
 * Prerequisites (.env):
 *   OPENAI_API_KEY
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Expected runtime: ~5-10 minutes for 20K titles (batched at 50 per
 * OpenAI request, ~100ms delay between batches).
 *
 * Expected cost: ~£0.20 for 20K titles.
 *
 * Failures are appended to scripts/embeddings/.failures.jsonl (one JSON
 * object per line). The .checkpoint.json + .failures.jsonl files are
 * git-ignored.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve } from 'path';

import { buildEmbeddingText, type EmbeddingInput } from '../../supabase/functions/_shared/embeddingTemplate.ts';
import { embedBatch } from '../../supabase/functions/_shared/openaiEmbeddings.ts';

// ── Load .env manually (no Vite in script context) ───────

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '..', '..', '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

const ENV = loadEnv();
const OPENAI_API_KEY = ENV.OPENAI_API_KEY;
const SUPABASE_URL = ENV.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars. Check .env has:');
  console.error('  OPENAI_API_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── CLI args ─────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limit = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : Infinity;

// ── Checkpoint + failures ────────────────────────────────

const CHECKPOINT_PATH = resolve(__dirname, '.checkpoint.json');
const FAILURES_PATH = resolve(__dirname, '.failures.jsonl');

interface Checkpoint {
  last_completed_id: number;
  started_at: string;
  processed_count: number;
  failed_count: number;
  total_tokens: number;
}

function loadCheckpoint(): Checkpoint | null {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCheckpoint(cp: Checkpoint): void {
  // Plain writeFileSync with EPERM retry — see backfill-enrichment.ts:99-139
  // for the full rationale. On Windows, file watchers hold transient handles
  // that cause EPERM on write. Retry 3x with 50ms spin-wait.
  const body = JSON.stringify(cp, null, 2);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      writeFileSync(CHECKPOINT_PATH, body);
      return;
    } catch (err) {
      lastErr = err;
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'EPERM'
      ) {
        const until = Date.now() + 50;
        while (Date.now() < until) { /* spin */ }
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const CHECKPOINT_INTERVAL = 50;

function appendFailure(record: object): void {
  appendFileSync(FAILURES_PATH, JSON.stringify(record) + '\n');
}

// ── Work queue ───────────────────────────────────────────

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

const BATCH_SIZE = 500; // Supabase fetch batch
const EMBED_BATCH_SIZE = 50; // OpenAI request batch

async function fetchBatch(afterId: number): Promise<TitleRow[]> {
  const { data, error } = await supabase
    .from('titles')
    .select('id, tmdb_id, title, release_year, media_type, genre_ids, overview, keywords, cast_top_5, runtime')
    .is('embedding', null)
    .not('keywords', 'is', null)
    .gt('id', afterId)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    throw new Error(`Supabase select failed: ${error.message}`);
  }
  return (data ?? []) as TitleRow[];
}

function rowToEmbeddingInput(row: TitleRow): EmbeddingInput {
  return {
    title: row.title,
    release_year: row.release_year,
    media_type: row.media_type,
    genre_ids: row.genre_ids ?? [],
    overview: row.overview,
    keywords: row.keywords ?? [],
    cast_top_5: row.cast_top_5 ?? [],
    runtime: row.runtime,
  };
}

// ── Main loop ────────────────────────────────────────────

async function main(): Promise<void> {
  const { count: totalCount } = await supabase
    .from('titles')
    .select('id', { count: 'exact', head: true });
  const { count: pendingCount } = await supabase
    .from('titles')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)
    .not('keywords', 'is', null);

  console.log('Phase 1 embedding backfill');
  console.log(`  total titles:    ${totalCount ?? '?'}`);
  console.log(`  pending (embedding IS NULL, keywords IS NOT NULL): ${pendingCount ?? '?'}`);
  console.log(`  mode:            ${dryRun ? 'DRY-RUN (no embeds/writes)' : 'LIVE'}`);
  if (limit !== Infinity) console.log(`  limit:           ${limit}`);
  console.log('');

  const existingCheckpoint = loadCheckpoint();
  const checkpoint: Checkpoint = existingCheckpoint ?? {
    last_completed_id: 0,
    started_at: new Date().toISOString(),
    processed_count: 0,
    failed_count: 0,
    total_tokens: 0,
  };

  if (existingCheckpoint) {
    console.log(`Resuming from checkpoint (last_completed_id=${existingCheckpoint.last_completed_id}, processed so far=${existingCheckpoint.processed_count}, tokens so far=${existingCheckpoint.total_tokens})`);
    console.log('');
  }

  const startedAt = Date.now();
  let lastProgressLog = Date.now();

  while (true) {
    if (checkpoint.processed_count >= limit) {
      console.log(`\nLimit (${limit}) reached.`);
      break;
    }

    const batch = await fetchBatch(checkpoint.last_completed_id);
    if (batch.length === 0) {
      console.log('\nWork queue empty.');
      break;
    }

    // Process the Supabase batch in sub-batches of EMBED_BATCH_SIZE for OpenAI
    for (let i = 0; i < batch.length; i += EMBED_BATCH_SIZE) {
      if (checkpoint.processed_count >= limit) break;

      const remaining = limit - checkpoint.processed_count;
      const subBatch = batch.slice(i, Math.min(i + EMBED_BATCH_SIZE, i + remaining));

      // Build embedding texts
      const texts = subBatch.map((row) => buildEmbeddingText(rowToEmbeddingInput(row)));

      if (dryRun) {
        // In dry-run mode, show the first text and skip embedding
        if (checkpoint.processed_count === 0) {
          console.log('Sample embedding text (first row):');
          console.log('---');
          console.log(texts[0]);
          console.log('---');
          console.log(`  chars: ${texts[0].length}`);
          console.log('');
        }
        for (const row of subBatch) {
          checkpoint.processed_count++;
          checkpoint.last_completed_id = row.id;
        }
      } else {
        // Call OpenAI
        const result = await embedBatch(texts, OPENAI_API_KEY, { delayMs: 100, maxRetries: 3 });

        if (!result) {
          // Entire batch failed — log each row as failed
          for (const row of subBatch) {
            checkpoint.failed_count++;
            appendFailure({
              id: row.id,
              tmdb_id: row.tmdb_id,
              media_type: row.media_type,
              reason: 'openai_batch_failure',
              at: new Date().toISOString(),
            });
            checkpoint.last_completed_id = row.id;
          }
          continue;
        }

        checkpoint.total_tokens += result.total_tokens;

        // Write each embedding to Supabase
        for (let j = 0; j < subBatch.length; j++) {
          const row = subBatch[j];
          const embResult = result.results[j];

          if (!embResult) {
            checkpoint.failed_count++;
            appendFailure({
              id: row.id,
              tmdb_id: row.tmdb_id,
              media_type: row.media_type,
              reason: 'openai_null_result',
              at: new Date().toISOString(),
            });
            checkpoint.last_completed_id = row.id;
            continue;
          }

          try {
            // pgvector accepts the embedding as a JSON string representation
            const vectorStr = `[${embResult.embedding.join(',')}]`;
            const { error } = await supabase
              .from('titles')
              .update({ embedding: vectorStr })
              .eq('id', row.id);
            if (error) {
              throw new Error(error.message);
            }
            checkpoint.processed_count++;
          } catch (err) {
            checkpoint.failed_count++;
            const message = err instanceof Error ? err.message : String(err);
            console.error(`  fail  ${row.media_type}/${row.tmdb_id}: ${message}`);
            appendFailure({
              id: row.id,
              tmdb_id: row.tmdb_id,
              media_type: row.media_type,
              reason: 'supabase_update_error',
              message,
              at: new Date().toISOString(),
            });
          }

          checkpoint.last_completed_id = row.id;
        }
      }

      // Checkpoint every CHECKPOINT_INTERVAL rows (live mode only)
      const totalTouched = checkpoint.processed_count + checkpoint.failed_count;
      if (!dryRun && totalTouched % CHECKPOINT_INTERVAL === 0 && totalTouched > 0) {
        writeCheckpoint(checkpoint);
        const costUsd = (checkpoint.total_tokens / 1_000_000) * 0.02;
        console.log(`  [checkpoint] tokens=${checkpoint.total_tokens} cost≈$${costUsd.toFixed(4)}`);
      }

      // Progress log every 100 processed or every 30 seconds
      const now = Date.now();
      if (totalTouched % 100 === 0 || now - lastProgressLog > 30000) {
        const elapsed = (now - startedAt) / 1000;
        const rate = totalTouched > 0 ? elapsed / totalTouched : 0;
        const remainingRows = (pendingCount ?? 0) - totalTouched;
        const etaSec = Math.round(rate * remainingRows);
        const etaMin = Math.round(etaSec / 60);
        console.log(
          `  [${totalTouched}/${pendingCount ?? '?'}] processed=${checkpoint.processed_count} failed=${checkpoint.failed_count} tokens=${checkpoint.total_tokens} eta=${etaMin}m`
        );
        lastProgressLog = now;
      }
    }
  }

  // Flush final checkpoint
  if (!dryRun) {
    writeCheckpoint(checkpoint);
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  const finalCostUsd = (checkpoint.total_tokens / 1_000_000) * 0.02;
  console.log('');
  console.log('Done.');
  console.log(`  processed: ${checkpoint.processed_count}`);
  console.log(`  failed:    ${checkpoint.failed_count}`);
  console.log(`  tokens:    ${checkpoint.total_tokens}`);
  console.log(`  cost:      ~$${finalCostUsd.toFixed(4)} (at $0.02/M tokens)`);
  console.log(`  elapsed:   ${Math.round(elapsedSec / 60)}m ${elapsedSec % 60}s`);
  if (checkpoint.failed_count > 0) {
    console.log(`  failures logged to: ${FAILURES_PATH}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
