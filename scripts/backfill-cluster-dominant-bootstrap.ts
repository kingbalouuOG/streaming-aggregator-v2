/**
 * Backfill — Cluster-Dominant Bootstrap (ADR-013)
 *
 * Re-bootstraps existing taste_profiles rows using the new cluster-dominant
 * weights (cluster=0.75) so legacy users converge with new users instead of
 * carrying the Phase 3 watched-grid-dominant anchor indefinitely.
 *
 * Why a backfill is necessary:
 *   recomputeFromInteractions (interactionUpdate.ts:155) uses the saved
 *   bootstrap_vector as its anchor and replays interactions on top — it
 *   never re-runs getBootstrapWeights. Without this script, every legacy
 *   user keeps the old weighted blend forever.
 *
 * What this script does, per row:
 *   1. Read services from user_services table.
 *   2. Read selected_clusters from taste_profiles.
 *   3. Re-run the bootstrap formula with the new weights. Watched-grid taps
 *      from original onboarding were never persisted, so we re-bootstrap
 *      with watched=[] — the new formula handles this cleanly (when
 *      watchedCount===0 and clusters present: service=0.25, genre=0.75).
 *   4. UPDATE taste_profiles with new vector + bootstrapped_from='reweight_2026_05'.
 *
 * Interaction replay note:
 *   We deliberately do NOT replay user_interactions inside this script.
 *   The app's useTasteProfile hook already runs recomputeFromInteractions
 *   on the saved vector at load time — once we update the saved vector,
 *   the next session naturally rebuilds the user's full state on top of
 *   the new anchor.
 *
 * Idempotent: skips rows already marked 'reweight_2026_05'.
 *
 * Usage:
 *   npx tsx scripts/backfill-cluster-dominant-bootstrap.ts                # dry-run (default)
 *   npx tsx scripts/backfill-cluster-dominant-bootstrap.ts --execute      # write to DB
 *   npx tsx scripts/backfill-cluster-dominant-bootstrap.ts --execute --user <uuid>  # single user
 *
 * Safety: writes are gated behind --execute so accidental imports / typecheck
 * runs cannot mutate production data.
 *
 * Pre-requisites:
 *   - .env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - taste_profiles.taste_vector_bootstrapped_from column exists (migration 023)
 *   - user_services table populated (Phase 0)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Env / client ───────────────────────────────────
function loadEnv(): Record<string, string> {
  const c = readFileSync(resolve(__dirname, '..', '.env'), 'utf-8');
  const e: Record<string, string> = {};
  for (const line of c.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    e[t.slice(0, i)] = t.slice(i + 1);
  }
  return e;
}
const ENV = loadEnv();
const supabase = createClient(ENV.VITE_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);

// ── CLI args ───────────────────────────────────────
const args = process.argv.slice(2);
// Default to dry-run; require explicit --execute to write. Prevents accidental
// mutations from imports / typechecks / shell autocomplete.
const DRY_RUN = !args.includes('--execute');
const USER_FILTER = args.includes('--user') ? args[args.indexOf('--user') + 1] : null;

const TARGET_BOOTSTRAP_TAG = 'reweight_2026_05';

// ── Cluster representatives (mirrors src/lib/taste-v2/tasteClusters.ts) ──
// These must match the production tasteClusters.ts post-merge. If reps
// change, regenerate this constant before re-running the backfill.
const CLUSTER_REPS: Record<string, number[]> = {
  'feel-good-funny': [18785, 8363, 10625, 55721, 2316, 48891, 97546, 66573, 1421],
  'action-adrenaline': [562, 353081, 155, 49026],
  'dark-thrillers': [807, 210577, 146233, 273481],
  'rom-coms-love-stories': [11036, 455207, 4348],
  'epic-scifi-fantasy': [157336, 335984, 329865],
  'horror-supernatural': [419430, 447332, 126889],
  'mind-bending-mysteries': [27205, 11324, 1124, 77],
  'heartfelt-drama': [278, 238, 13],
  'true-crime-real-stories': [1430, 64439],
  'anime-animation': [324857, 129, 150540, 31910, 85937, 95479, 120089, 209867],
  'prestige-award-winners': [581734, 426426, 68734, 399055],
  'history-war': [857, 374720, 16869],
  'reality-entertainment': [37678, 2370, 40290],
  'cult-indie': [550, 680],
  'family-kids': [12, 8587, 277834, 862, 246, 40075, 82728, 387, 15260],
  'westerns-frontier': [429, 68718, 281957, 6977],
};

// ── Vector ops ─────────────────────────────────────
function centroid(vs: number[][]): number[] {
  if (vs.length === 0) return [];
  const dim = vs[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vs) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vs.length;
  return out;
}
function weightedSum(vs: number[][], ws: number[]): number[] {
  const dim = vs[0].length;
  const out = new Array(dim).fill(0);
  for (let j = 0; j < vs.length; j++) {
    const w = ws[j], v = vs[j];
    for (let i = 0; i < dim; i++) out[i] += w * v[i];
  }
  return out;
}
function l2Normalise(v: number[]): number[] {
  let m = 0; for (const x of v) m += x * x; m = Math.sqrt(m);
  return m === 0 ? v.slice() : v.map(x => x / m);
}
function parseEmb(raw: any): number[] | null {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
  return raw as number[];
}

// ── Bootstrap formula (mirrors src/lib/taste-v2/bootstrap.ts) ──
// Must match production. Invariant: service + watched + genre === 1.0.
function getBootstrapWeights(watchedCount: number, hasGenres: boolean) {
  let service: number, watched: number, genre: number;
  if (watchedCount === 0) {
    service = 0.25; watched = 0.00; genre = 0.75;
  } else if (watchedCount <= 4) {
    service = 0.13; watched = 0.12; genre = 0.75;
  } else if (watchedCount <= 12) {
    service = 0.09; watched = 0.16; genre = 0.75;
  } else {
    service = 0.05; watched = 0.20; genre = 0.75;
  }
  if (!hasGenres) { service += genre; genre = 0; }
  return { service, watched, genre };
}

async function fetchServiceCentroids(serviceIds: string[]): Promise<number[][]> {
  if (serviceIds.length === 0) return [];
  const { data } = await supabase.from('service_fingerprints').select('centroid')
    .in('service_id', serviceIds).eq('variant', 'v1_popularity').eq('region', 'GB');
  const out: number[][] = [];
  for (const row of (data ?? []) as any[]) {
    const e = parseEmb(row.centroid);
    if (e) out.push(e);
  }
  return out;
}

async function fetchClusterEmbeddings(clusterIds: string[]): Promise<number[][]> {
  const repIds = clusterIds.flatMap(c => CLUSTER_REPS[c] ?? []);
  if (repIds.length === 0) return [];
  const { data } = await supabase.from('titles').select('embedding')
    .in('tmdb_id', Array.from(new Set(repIds)))
    .not('embedding', 'is', null);
  const out: number[][] = [];
  for (const row of (data ?? []) as any[]) {
    const e = parseEmb(row.embedding);
    if (e) out.push(e);
  }
  return out;
}

interface ProfileRow {
  user_id: string;
  selected_clusters: string[] | null;
  taste_vector_bootstrapped_from: string | null;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'EXECUTE (writing to DB)'}`);
  if (USER_FILTER) console.log(`Filter: single user ${USER_FILTER}`);
  console.log('');

  let q = supabase.from('taste_profiles')
    .select('user_id, selected_clusters, taste_vector_bootstrapped_from')
    .not('taste_vector_v2', 'is', null);
  if (USER_FILTER) q = q.eq('user_id', USER_FILTER);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as ProfileRow[];
  const todo = rows.filter(r => r.taste_vector_bootstrapped_from !== TARGET_BOOTSTRAP_TAG);

  console.log(`Found ${rows.length} taste_profiles rows; ${todo.length} need re-bootstrap.`);
  console.log('');

  let success = 0, skipped = 0, failed = 0;

  for (const row of todo) {
    try {
      const { data: svcRows } = await supabase
        .from('user_services').select('service_id').eq('user_id', row.user_id);
      const serviceIds = ((svcRows ?? []) as any[]).map(r => r.service_id);
      const clusterIds = row.selected_clusters ?? [];

      if (serviceIds.length === 0 && clusterIds.length === 0) {
        console.log(`  [skip] ${row.user_id}: no services and no clusters`);
        skipped++;
        continue;
      }

      const [serviceCentroids, clusterEmbeddings] = await Promise.all([
        fetchServiceCentroids(serviceIds),
        fetchClusterEmbeddings(clusterIds),
      ]);

      const sV = serviceCentroids.length > 0 ? centroid(serviceCentroids) : null;
      const gV = clusterEmbeddings.length > 0 ? centroid(clusterEmbeddings) : null;
      if (!sV && !gV) {
        console.log(`  [skip] ${row.user_id}: no service centroids and no cluster embeddings`);
        skipped++;
        continue;
      }

      const ws = getBootstrapWeights(0 /* no persisted taps */, clusterEmbeddings.length > 0);
      const vs: number[][] = [];
      const wws: number[] = [];
      if (sV && ws.service > 0) { vs.push(sV); wws.push(ws.service); }
      if (gV && ws.genre > 0) { vs.push(gV); wws.push(ws.genre); }
      const finalVector = l2Normalise(weightedSum(vs, wws));

      if (DRY_RUN) {
        console.log(`  [dry-run] ${row.user_id}: would update (services=${serviceIds.length}, clusters=${clusterIds.length})`);
      } else {
        const { error: updateErr } = await supabase
          .from('taste_profiles')
          .update({
            taste_vector_v2: finalVector as any,
            taste_vector_updated_at: new Date().toISOString(),
            taste_vector_bootstrapped_from: TARGET_BOOTSTRAP_TAG,
          })
          .eq('user_id', row.user_id);
        if (updateErr) {
          console.log(`  [fail] ${row.user_id}: ${updateErr.message}`);
          failed++;
          continue;
        }
        console.log(`  [ok]   ${row.user_id}: re-bootstrapped (services=${serviceIds.length}, clusters=${clusterIds.length})`);
      }
      success++;
    } catch (e) {
      console.log(`  [fail] ${row.user_id}: ${(e as Error).message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Done. success=${success}, skipped=${skipped}, failed=${failed}`);
  if (DRY_RUN) console.log('(no rows written — re-run without --dry-run to execute)');
}

main().catch(e => { console.error(e); process.exit(1); });
