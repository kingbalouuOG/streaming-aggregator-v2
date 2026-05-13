/**
 * Phase Search V2 Cluster B (B6) — semantic search eval rig.
 *
 * Reads scripts/test/search-semantic-fixtures.json, runs each query
 * through OpenAI text-embedding-3-small + match_titles_by_vector,
 * compares the returned top-N tmdb_ids against the expected set, and
 * computes precision@10 + MRR. Fails the process when either metric
 * drops below the fixture's thresholds.
 *
 * Bypasses the embed-query Edge function deliberately — CI doesn't
 * need an authenticated round-trip, and a direct OpenAI call here
 * exercises the SAME embedding model the function uses, so model
 * drift would still surface.
 *
 * Run locally:
 *   OPENAI_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/test/search-semantic-eval.ts
 *
 * Run from CI: see .github/workflows/search-semantic-eval.yml.
 *
 * The fixture is a stub at landing-time — Joe authors the real 20-
 * query set as a separate deliverable (it gates flag-flip, not this
 * commit).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

interface FixtureEntry {
  query: string;
  expected: Array<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string }>;
}

interface Fixture {
  version: number;
  thresholds: { precisionAt10: number; mrr: number };
  queries: FixtureEntry[];
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY) {
  console.error('Missing env: OPENAI_API_KEY');
  process.exit(2);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const fixturePath = resolve(__dirname, 'search-semantic-fixtures.json');
const fixture: Fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));

if (!Array.isArray(fixture.queries) || fixture.queries.length === 0) {
  console.error('Fixture has no queries.');
  process.exit(2);
}

// ── Helpers ────────────────────────────────────────────────────────

async function embedQuery(query: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: query,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json() as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

async function retrieveTopN(queryEmbedding: number[], limit: number): Promise<number[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`;
  const { data, error } = await supabase.rpc('match_titles_by_vector', {
    query_vector: vectorStr,
    match_limit: limit,
  });
  if (error || !data) throw new Error(`match_titles_by_vector failed: ${error?.message ?? 'no data'}`);
  return (data as Array<{ tmdb_id: number }>).map((r) => r.tmdb_id);
}

function precisionAt10(returned: number[], expected: number[]): number {
  if (returned.length === 0) return 0;
  const top = returned.slice(0, 10);
  const expectedSet = new Set(expected);
  const hits = top.filter((id) => expectedSet.has(id)).length;
  return hits / Math.min(10, expected.length || 10);
}

function reciprocalRank(returned: number[], expected: number[]): number {
  const expectedSet = new Set(expected);
  for (let i = 0; i < returned.length; i++) {
    if (expectedSet.has(returned[i])) return 1 / (i + 1);
  }
  return 0;
}

// ── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const queryThresholds = fixture.thresholds;
  console.log(`Eval over ${fixture.queries.length} queries; thresholds p@10 >= ${queryThresholds.precisionAt10}, MRR >= ${queryThresholds.mrr}`);

  let pSum = 0;
  let mrrSum = 0;
  const perQuery: Array<{ query: string; p: number; rr: number; topPreview: string }> = [];

  for (const entry of fixture.queries) {
    const expectedIds = entry.expected.map((e) => e.tmdbId);
    try {
      const embedding = await embedQuery(entry.query);
      const returnedIds = await retrieveTopN(embedding, 50);
      const p = precisionAt10(returnedIds, expectedIds);
      const rr = reciprocalRank(returnedIds, expectedIds);
      pSum += p;
      mrrSum += rr;
      const topPreview = returnedIds.slice(0, 5).join(',');
      perQuery.push({ query: entry.query, p, rr, topPreview });
      console.log(`  "${entry.query}"  p@10=${p.toFixed(2)}  rr=${rr.toFixed(2)}  top5=${topPreview}`);
    } catch (err) {
      console.error(`  "${entry.query}" failed:`, err);
      perQuery.push({ query: entry.query, p: 0, rr: 0, topPreview: 'error' });
    }
  }

  const meanP = pSum / fixture.queries.length;
  const meanMRR = mrrSum / fixture.queries.length;

  console.log('');
  console.log(`Mean precision@10: ${meanP.toFixed(3)}  (threshold ${queryThresholds.precisionAt10})`);
  console.log(`Mean MRR:          ${meanMRR.toFixed(3)}  (threshold ${queryThresholds.mrr})`);

  const passP = meanP >= queryThresholds.precisionAt10;
  const passMRR = meanMRR >= queryThresholds.mrr;
  if (!passP || !passMRR) {
    console.error('');
    console.error('FAIL — semantic search eval below threshold.');
    if (!passP) console.error(`  precision@10 ${meanP.toFixed(3)} < ${queryThresholds.precisionAt10}`);
    if (!passMRR) console.error(`  MRR ${meanMRR.toFixed(3)} < ${queryThresholds.mrr}`);
    process.exit(1);
  }
  console.log('');
  console.log('PASS');
}

main().catch((err) => {
  console.error('Eval rig crashed:', err);
  process.exit(2);
});
