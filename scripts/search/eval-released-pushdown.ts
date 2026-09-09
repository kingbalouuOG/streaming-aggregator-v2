/**
 * How many titles survive the *Newer* filter, before and after pushing
 * `released` into the vector RPC (review 2026-09-09-001, engine follow-up).
 *
 * `released` was a post-filter over the candidate pool: retrieve 150 by
 * vector distance, then drop anything released before last year. The
 * survivor count is whatever the pool happened to contain, so *Newer* on
 * a semantic query could thin a grid to almost nothing.
 *
 * Migration 082 adds `min_release_year` to match_titles_by_vector. This
 * measures the difference on the eval fixture's own queries.
 *
 * The caveat this exists to quantify: pgvector applies a WHERE clause
 * AFTER the HNSW scan unless `hnsw.iterative_scan` is on, and it is not
 * set anywhere. A selective predicate still under-returns; widening
 * ef_search is a mitigation, not a guarantee. If the after-count is
 * still short of the request, that is this caveat showing up, not a bug.
 *
 * Run:
 *   OPENAI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/search/eval-released-pushdown.ts
 *
 * `--mode=before` skips the min_release_year argument, so the script runs
 * against a database where migration 082 has not been applied yet.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const MODE = process.argv.includes('--mode=before') ? 'before' : 'after';

/** The app's candidate pool for a semantic search (semanticCore default). */
const CANDIDATE_LIMIT = 150;

/** *Newer* is the last twelve months — minYearForWindow in browseFilters. */
const MIN_RELEASE_YEAR = new Date().getFullYear() - 1;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface FixtureEntry { query: string; kind?: string }
const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../test/search-semantic-fixtures.json'), 'utf-8'),
) as { queries: FixtureEntry[] };

async function embedQuery(query: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`);
  const json = await res.json() as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

/** Release years for a matched set, keyed the way semanticCore keys them. */
async function releaseYears(
  matched: Array<{ tmdb_id: number; media_type: string }>,
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (matched.length === 0) return out;
  const { data, error } = await supabase
    .from('titles')
    .select('tmdb_id, media_type, release_year')
    .in('tmdb_id', matched.map((m) => m.tmdb_id));
  if (error || !data) throw new Error(`titles read failed: ${error?.message}`);
  for (const r of data as Array<{ tmdb_id: number; media_type: string; release_year: number | null }>) {
    out.set(`${r.tmdb_id}:${r.media_type}`, r.release_year);
  }
  return out;
}

interface Row { query: string; retrieved: number; survivors: number; ms: number }

async function measure(entry: FixtureEntry): Promise<Row> {
  const embedding = await embedQuery(entry.query);
  const vectorStr = `[${embedding.join(',')}]`;

  const args: Record<string, unknown> = {
    query_vector: vectorStr,
    match_limit: CANDIDATE_LIMIT,
  };
  if (MODE === 'after') args.min_release_year = MIN_RELEASE_YEAR;

  const t = Date.now();
  const { data, error } = await supabase.rpc('match_titles_by_vector', args);
  const ms = Date.now() - t;
  if (error || !data) throw new Error(`rpc failed: ${error?.message ?? 'no data'}`);

  const matched = data as Array<{ tmdb_id: number; media_type: string }>;
  const years = await releaseYears(matched);
  const survivors = matched.filter(
    (m) => (years.get(`${m.tmdb_id}:${m.media_type}`) ?? 0) >= MIN_RELEASE_YEAR,
  ).length;

  return { query: entry.query, retrieved: matched.length, survivors, ms };
}

function pct(a: number, b: number): string {
  return b === 0 ? '–' : `${((a / b) * 100).toFixed(0)}%`;
}

(async () => {
  console.log(
    `mode=${MODE}  candidateLimit=${CANDIDATE_LIMIT}  minReleaseYear=${MIN_RELEASE_YEAR}  `
    + `queries=${fixture.queries.length}\n`,
  );

  const rows: Row[] = [];
  for (const entry of fixture.queries) {
    rows.push(await measure(entry));
  }

  const width = Math.min(46, Math.max(...rows.map((r) => r.query.length)));
  console.log(
    `${'query'.padEnd(width)}  retrieved  survivors   share   ms`,
  );
  for (const r of rows) {
    console.log(
      `${r.query.slice(0, width).padEnd(width)}  ${String(r.retrieved).padStart(9)}  `
      + `${String(r.survivors).padStart(9)}  ${pct(r.survivors, r.retrieved).padStart(6)}  `
      + `${String(r.ms).padStart(4)}`,
    );
  }

  const totalSurvivors = rows.reduce((a, r) => a + r.survivors, 0);
  const mean = totalSurvivors / rows.length;
  const sortedMs = rows.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = sortedMs[Math.floor(sortedMs.length * 0.5)];
  const p95 = sortedMs[Math.min(sortedMs.length - 1, Math.floor(sortedMs.length * 0.95))];
  const starved = rows.filter((r) => r.survivors < 20).length;

  console.log(
    `\nmean survivors ${mean.toFixed(1)} / ${CANDIDATE_LIMIT}   `
    + `queries under 20 survivors: ${starved}/${rows.length}   `
    + `rpc p50 ${p50}ms  p95 ${p95}ms`,
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
