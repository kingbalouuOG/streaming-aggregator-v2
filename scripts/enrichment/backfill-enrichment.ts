/**
 * Phase 0.5 Content Enrichment Backfill
 *
 * One-time bulk script that populates the four new enrichment columns
 * (keywords, cast_top_5, director, content_rating) plus runtime for
 * every existing row in `titles` where keywords IS NULL.
 *
 * Runs from a developer laptop (NOT an Edge Function — no timeout
 * pressure). Resume-safe by construction: the work-queue query is
 * `WHERE keywords IS NULL`, so re-running picks up wherever the last
 * run stopped, regardless of whether it crashed cleanly or was killed.
 * The .checkpoint.json file is a human-readable progress marker, not
 * the source of truth.
 *
 * Usage:
 *   npx tsx scripts/enrichment/backfill-enrichment.ts                # full run
 *   npx tsx scripts/enrichment/backfill-enrichment.ts --limit 50     # process at most 50 rows
 *   npx tsx scripts/enrichment/backfill-enrichment.ts --dry-run      # fetch + extract but don't UPDATE
 *   npx tsx scripts/enrichment/backfill-enrichment.ts --limit 10 --dry-run
 *
 * Prerequisites (.env):
 *   VITE_TMDB_API_KEY
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Expected runtime: ~90 minutes for 20K titles at 260 ms per TMDb call.
 *
 * Failures are appended to scripts/enrichment/.failures.jsonl (one JSON
 * object per line). The .checkpoint.json + .failures.jsonl files are
 * git-ignored.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, appendFileSync, renameSync, existsSync } from 'fs';
import { resolve } from 'path';

import { extractFields } from '../../supabase/functions/_shared/extract_fields.ts';
import { fetchEnrichmentFields } from './tmdb-enrichment-client.ts';

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
const TMDB_API_KEY = ENV.VITE_TMDB_API_KEY;
const SUPABASE_URL = ENV.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;

if (!TMDB_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars. Check .env has:');
  console.error('  VITE_TMDB_API_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
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
  skipped_count: number;
  failed_count: number;
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
  // Atomic: write to .tmp then rename, so a process kill mid-write
  // never corrupts the checkpoint.
  const tmp = `${CHECKPOINT_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(cp, null, 2));
  renameSync(tmp, CHECKPOINT_PATH);
}

function appendFailure(record: object): void {
  appendFileSync(FAILURES_PATH, JSON.stringify(record) + '\n');
}

// ── Work queue ───────────────────────────────────────────

interface TitleRow {
  id: number;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
}

const BATCH_SIZE = 500;

async function fetchBatch(afterId: number): Promise<TitleRow[]> {
  // Note: the `.eq('keywords', null)` predicate would not work — Supabase
  // PostgREST requires `.is('keywords', null)` for IS NULL.
  const { data, error } = await supabase
    .from('titles')
    .select('id, tmdb_id, media_type')
    .is('keywords', null)
    .gt('id', afterId)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    throw new Error(`Supabase select failed: ${error.message}`);
  }
  return (data ?? []) as TitleRow[];
}

async function updateRow(row: TitleRow, payload: ReturnType<typeof extractFields>): Promise<void> {
  const { error } = await supabase
    .from('titles')
    .update(payload)
    .eq('tmdb_id', row.tmdb_id)
    .eq('media_type', row.media_type);
  if (error) {
    throw new Error(`Supabase update failed for ${row.media_type}/${row.tmdb_id}: ${error.message}`);
  }
}

// ── Main loop ────────────────────────────────────────────

async function main(): Promise<void> {
  // Sanity: total + already-enriched count, so the user sees the work
  // ahead at the start.
  const { count: totalCount } = await supabase
    .from('titles')
    .select('id', { count: 'exact', head: true });
  const { count: pendingCount } = await supabase
    .from('titles')
    .select('id', { count: 'exact', head: true })
    .is('keywords', null);

  console.log('Phase 0.5 enrichment backfill');
  console.log(`  total titles:    ${totalCount ?? '?'}`);
  console.log(`  pending (keywords IS NULL): ${pendingCount ?? '?'}`);
  console.log(`  mode:            ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`);
  if (limit !== Infinity) console.log(`  limit:           ${limit}`);
  console.log('');

  const existingCheckpoint = loadCheckpoint();
  const checkpoint: Checkpoint = existingCheckpoint ?? {
    last_completed_id: 0,
    started_at: new Date().toISOString(),
    processed_count: 0,
    skipped_count: 0,
    failed_count: 0,
  };

  if (existingCheckpoint) {
    console.log(`Resuming from checkpoint (last_completed_id=${existingCheckpoint.last_completed_id}, processed so far=${existingCheckpoint.processed_count})`);
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

    for (const row of batch) {
      if (checkpoint.processed_count >= limit) break;

      try {
        const tmdbResponse = await fetchEnrichmentFields(
          TMDB_API_KEY,
          row.tmdb_id,
          row.media_type
        );

        if (tmdbResponse === null) {
          // 404 — TMDb deleted the title. Mark skipped, leave keywords NULL
          // so a future re-run will pick it up if TMDb re-adds it. Advance
          // the checkpoint past this id so we don't re-fetch it forever.
          checkpoint.skipped_count++;
          appendFailure({
            id: row.id,
            tmdb_id: row.tmdb_id,
            media_type: row.media_type,
            reason: 'tmdb_404',
            at: new Date().toISOString(),
          });
        } else {
          const fields = extractFields(tmdbResponse, row.media_type);
          if (!dryRun) {
            await updateRow(row, fields);
          }
          checkpoint.processed_count++;
        }
      } catch (err) {
        checkpoint.failed_count++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  fail  ${row.media_type}/${row.tmdb_id}: ${message}`);
        appendFailure({
          id: row.id,
          tmdb_id: row.tmdb_id,
          media_type: row.media_type,
          reason: 'fetch_or_update_error',
          message,
          at: new Date().toISOString(),
        });
        // Don't advance the work-queue cursor on failure — but DO advance
        // last_completed_id past this row, otherwise we loop forever on
        // a permanently-failing title. The .failures.jsonl is the audit trail.
      }

      checkpoint.last_completed_id = row.id;

      // Persist checkpoint after every row (cheap atomic rename), but
      // ONLY in live mode. Dry-run must not advance the on-disk
      // checkpoint, otherwise a subsequent live run would skip the
      // rows the dry-run "saw" without actually writing them.
      if (!dryRun) {
        writeCheckpoint(checkpoint);
      }

      // Progress log every 100 processed titles or every 30 seconds.
      const now = Date.now();
      const totalDone = checkpoint.processed_count + checkpoint.skipped_count + checkpoint.failed_count;
      if (totalDone % 100 === 0 || now - lastProgressLog > 30000) {
        const elapsed = (now - startedAt) / 1000;
        const rate = totalDone > 0 ? elapsed / totalDone : 0;
        const remaining = (pendingCount ?? 0) - totalDone;
        const etaSec = Math.round(rate * remaining);
        const etaMin = Math.round(etaSec / 60);
        console.log(
          `  [${totalDone}/${pendingCount ?? '?'}] processed=${checkpoint.processed_count} skipped=${checkpoint.skipped_count} failed=${checkpoint.failed_count} eta=${etaMin}m`
        );
        lastProgressLog = now;
      }
    }
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log('');
  console.log('Done.');
  console.log(`  processed: ${checkpoint.processed_count}`);
  console.log(`  skipped:   ${checkpoint.skipped_count}`);
  console.log(`  failed:    ${checkpoint.failed_count}`);
  console.log(`  elapsed:   ${Math.round(elapsedSec / 60)}m ${elapsedSec % 60}s`);
  if (checkpoint.failed_count > 0) {
    console.log(`  failures logged to: ${FAILURES_PATH}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
