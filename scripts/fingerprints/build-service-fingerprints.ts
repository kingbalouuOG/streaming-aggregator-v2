/**
 * Phase 2 — Build Service Fingerprints
 *
 * Computes a 1536D centroid vector for each streaming service from the
 * top-N most popular catalogue titles (subscription/free only). Stores
 * results in the `service_fingerprints` table (migration 020).
 *
 * Runs from a developer laptop. Resume-safe via checkpoint + idempotent
 * upsert. Service count is small (~10), so a full re-run takes seconds.
 *
 * Usage:
 *   npx tsx scripts/fingerprints/build-service-fingerprints.ts              # full run
 *   npx tsx scripts/fingerprints/build-service-fingerprints.ts --dry-run    # report counts, no writes
 *   npx tsx scripts/fingerprints/build-service-fingerprints.ts --limit 3    # process at most 3 services
 *   npx tsx scripts/fingerprints/build-service-fingerprints.ts --top 200    # top-200 titles per service
 *
 * Prerequisites (.env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * No OPENAI_API_KEY needed — this script only reads existing embeddings.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { computeCentroid } from '../../supabase/functions/_shared/centroidMath.ts';

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
const SUPABASE_URL = ENV.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars. Check .env has:');
  console.error('  VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── CLI args ─────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitServices = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : Infinity;
const topN = args.includes('--top')
  ? parseInt(args[args.indexOf('--top') + 1], 10)
  : 150;

// ── Checkpoint + failures ────────────────────────────────

const CHECKPOINT_PATH = resolve(__dirname, '.checkpoint.json');
const FAILURES_PATH = resolve(__dirname, '.failures.jsonl');

interface Checkpoint {
  completed_services: string[];
  started_at: string;
  total_services: number;
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

function appendFailure(record: object): void {
  appendFileSync(FAILURES_PATH, JSON.stringify(record) + '\n');
}

// ── Supabase .in() batching ─────────────────────────────

const IN_BATCH_SIZE = 300;

/**
 * Fetch titles for a set of (tmdb_id, media_type) pairs, split by media_type
 * to ensure the join is on BOTH columns (TMDb ID namespace is separate for
 * movies and TV — same numeric ID can exist in both).
 */
async function fetchTitlesForPairs(
  pairs: { tmdb_id: number; media_type: string }[],
): Promise<{ id: number; tmdb_id: number; media_type: string; popularity: number; embedding: string }[]> {
  const byType = new Map<string, number[]>();
  for (const p of pairs) {
    const arr = byType.get(p.media_type) || [];
    arr.push(p.tmdb_id);
    byType.set(p.media_type, arr);
  }

  const results: { id: number; tmdb_id: number; media_type: string; popularity: number; embedding: string }[] = [];

  for (const [mediaType, tmdbIds] of byType) {
    // Deduplicate tmdb_ids within this media_type
    const uniqueIds = [...new Set(tmdbIds)];

    // Batch in chunks of IN_BATCH_SIZE
    for (let i = 0; i < uniqueIds.length; i += IN_BATCH_SIZE) {
      const batch = uniqueIds.slice(i, i + IN_BATCH_SIZE);
      const { data, error } = await supabase
        .from('titles')
        .select('id, tmdb_id, media_type, popularity, embedding')
        .in('tmdb_id', batch)
        .eq('media_type', mediaType)
        .not('embedding', 'is', null)
        .gte('vote_count', 50)
        .order('popularity', { ascending: false });

      if (error) {
        throw new Error(`titles query failed for ${mediaType}: ${error.message}`);
      }
      if (data) results.push(...data);
    }
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Phase 2 — Service Fingerprint Build');
  console.log(`  top-N per service: ${topN}`);
  console.log(`  mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log();

  // 1. Get distinct services from streaming_availability
  const { data: serviceRows, error: serviceErr } = await supabase
    .from('streaming_availability')
    .select('service_id')
    .in('stream_type', ['subscription', 'free']);

  if (serviceErr) {
    console.error('Failed to query services:', serviceErr.message);
    process.exit(1);
  }

  const allServices = [...new Set((serviceRows || []).map(r => r.service_id))].sort();
  console.log(`  services found: ${allServices.length} (${allServices.join(', ')})`);
  console.log();

  // Resume from checkpoint
  const checkpoint = loadCheckpoint();
  const completedSet = new Set(checkpoint?.completed_services || []);
  const services = allServices
    .filter(s => !completedSet.has(s))
    .slice(0, limitServices);

  if (services.length === 0) {
    console.log('  All services already processed (or none found). Done.');
    return;
  }

  const cp: Checkpoint = {
    completed_services: [...completedSet],
    started_at: checkpoint?.started_at || new Date().toISOString(),
    total_services: allServices.length,
  };

  const startTime = Date.now();
  let processed = 0;
  let failedCount = 0;

  for (const serviceId of services) {
    try {
      // Step 1: Fetch (tmdb_id, media_type) pairs from streaming_availability
      const saPairs: { tmdb_id: number; media_type: string }[] = [];
      let saOffset = 0;
      const SA_PAGE_SIZE = 1000;

      while (true) {
        const { data: saPage, error: saErr } = await supabase
          .from('streaming_availability')
          .select('tmdb_id, media_type')
          .eq('service_id', serviceId)
          .in('stream_type', ['subscription', 'free'])
          .range(saOffset, saOffset + SA_PAGE_SIZE - 1);

        if (saErr) throw new Error(`SA query for ${serviceId}: ${saErr.message}`);
        if (!saPage || saPage.length === 0) break;
        saPairs.push(...saPage);
        if (saPage.length < SA_PAGE_SIZE) break;
        saOffset += SA_PAGE_SIZE;
      }

      // Deduplicate pairs (a title can have both subscription + free entries)
      const seen = new Set<string>();
      const uniquePairs = saPairs.filter(p => {
        const key = `${p.tmdb_id}:${p.media_type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const saPairCount = uniquePairs.length;

      // Step 2: Fetch titles with embeddings, split by media_type
      const allTitles = await fetchTitlesForPairs(uniquePairs);

      // Step 3: Sort by popularity DESC, take top N
      allTitles.sort((a, b) => b.popularity - a.popularity);
      const topTitles = allTitles.slice(0, topN);

      // Step 4: Delta logging
      const lostToEmbeddingOrVotes = saPairCount - allTitles.length;
      const lostToTopN = allTitles.length - topTitles.length;
      console.log(`  ${serviceId}:`);
      console.log(`    SA catalogue pairs: ${saPairCount}`);
      console.log(`    titles with embedding + vote_count>=50: ${allTitles.length} (lost ${lostToEmbeddingOrVotes} to filters)`);
      console.log(`    top-N selected: ${topTitles.length}${lostToTopN > 0 ? ` (truncated from ${allTitles.length})` : ''}`);

      if (topTitles.length === 0) {
        console.log(`    SKIP — no eligible titles`);
        appendFailure({ service_id: serviceId, reason: 'no_eligible_titles', at: new Date().toISOString() });
        failedCount++;
        if (!dryRun) {
          cp.completed_services.push(serviceId);
          writeCheckpoint(cp);
        }
        continue;
      }

      if (topTitles.length < 50) {
        console.log(`    WARNING — low confidence (< 50 titles)`);
      }

      // Step 5: Parse embeddings and compute centroid
      const vectors: number[][] = [];
      const titleIds: number[] = [];

      for (const t of topTitles) {
        const emb = typeof t.embedding === 'string'
          ? JSON.parse(t.embedding)
          : t.embedding;
        vectors.push(emb);
        titleIds.push(t.id);
      }

      const centroid = computeCentroid(vectors);

      if (dryRun) {
        console.log(`    centroid computed (dry run — not writing)`);
      } else {
        // Step 7: Upsert into service_fingerprints
        const vectorStr = `[${centroid.join(',')}]`;
        const { error: upsertErr } = await supabase
          .from('service_fingerprints')
          .upsert({
            service_id: serviceId,
            region: 'GB',
            centroid: vectorStr,
            title_count: topTitles.length,
            source_title_ids: titleIds,
            computed_at: new Date().toISOString(),
          }, { onConflict: 'service_id,region' });

        if (upsertErr) {
          throw new Error(`upsert for ${serviceId}: ${upsertErr.message}`);
        }
        console.log(`    upserted`);
      }

      processed++;
      if (!dryRun) {
        cp.completed_services.push(serviceId);
        writeCheckpoint(cp);
      }

    } catch (err) {
      console.error(`  ${serviceId}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
      appendFailure({
        service_id: serviceId,
        reason: 'error',
        message: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      });
      failedCount++;
      if (!dryRun) {
        cp.completed_services.push(serviceId);
        writeCheckpoint(cp);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  console.log('Done.');
  console.log(`  services processed: ${processed}`);
  console.log(`  services failed: ${failedCount}`);
  console.log(`  elapsed: ${elapsed}s`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
