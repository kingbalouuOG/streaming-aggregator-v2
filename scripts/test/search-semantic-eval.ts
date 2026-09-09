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
 * The stub fixture was replaced with a real 16-entry set on 2026-09-09
 * (recommendation 2026-09-08-002 §10 Session 3). Two things changed here at
 * the same time, both because the first real run exposed them:
 *
 *   1. The rig now applies the app's post-retrieval quality floor before
 *      scoring — see `passesQualityFloor`. Without it the eval scored rows
 *      no user can ever see.
 *   2. Only entries marked `gate: true` decide pass/fail. See `FixtureEntry`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

interface FixtureEntry {
  query: string;
  expected: Array<{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string }>;
  /**
   * Whether this entry counts towards the pass/fail thresholds.
   *
   * Split in two on 2026-09-09 after the first real measurement. The
   * known-title entries have ONE right answer, so precision and MRR mean what
   * they say and a regression is unambiguous — those gate. The preset entries
   * are scored against a hand-curated set of six or seven titles out of a
   * six-figure catalogue, so an answer that is entirely good but picks
   * DIFFERENT good titles scores zero; gating on that would fail the build
   * for being correct. They are reported instead, and read by eye.
   */
  gate?: boolean;
  kind?: string;
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

/**
 * The quality floor the app applies after retrieval.
 *
 * Copied from `useSemanticSearch` / `scripts/search/eval-moods.ts` — drop
 * unrated entries, ultra-low-vote obscurities, and sub-40-minute movie
 * shorts (TV episodes are legitimately short).
 *
 * Applying it here is not cosmetic. Measured 2026-09-09 against the raw RPC:
 * a descriptive query returns near-literal title matches on zero-vote
 * catalogue debris — "something dark and strange for late at night" retrieved
 * a film called *Late Night* with no votes at all, and "something easy and
 * warm I can half-watch" retrieved *Snug And Cozi* and *Home Made Easy*.
 * None of those can reach a user, because the app filters them out before
 * rendering. An eval scored on rows nobody sees measures the wrong system:
 * it would fail on results that are fine and pass on regressions that are
 * not. The rig now scores the list the grid would actually show.
 */
function passesQualityFloor(m: {
  vote_average: number | null;
  vote_count: number | null;
  media_type: string;
  runtime: number | null;
}): boolean {
  return (
    (m.vote_average ?? 0) > 0 &&
    (m.vote_count ?? 0) >= 20 &&
    (m.media_type === 'tv' || (m.runtime ?? 0) >= 40)
  );
}

/**
 * Candidate ids in rank order, after the quality floor.
 *
 * Over-fetches (the app's own `candidateLimit`) so the floor has room to
 * discard without starving the top-10 window the metrics are computed over.
 */
async function retrieveTopN(queryEmbedding: number[], limit: number): Promise<number[]> {
  const vectorStr = `[${queryEmbedding.join(',')}]`;
  const { data, error } = await supabase.rpc('match_titles_by_vector', {
    query_vector: vectorStr,
    match_limit: Math.max(limit, 150),
  });
  if (error || !data) throw new Error(`match_titles_by_vector failed: ${error?.message ?? 'no data'}`);

  const matched = data as Array<{ tmdb_id: number; media_type: string }>;
  if (matched.length === 0) return [];

  const { data: rows, error: metaError } = await supabase
    .from('titles')
    .select('tmdb_id, media_type, vote_average, vote_count, runtime')
    .in('tmdb_id', matched.map((r) => r.tmdb_id));
  if (metaError || !rows) throw new Error(`titles metadata failed: ${metaError?.message ?? 'no data'}`);

  // Key on (tmdb_id, media_type): titles.tmdb_id is not unique across media
  // types, so a film and a series can share one.
  const meta = new Map(
    (rows as Array<{
      tmdb_id: number;
      media_type: string;
      vote_average: number | null;
      vote_count: number | null;
      runtime: number | null;
    }>).map((r) => [`${r.tmdb_id}:${r.media_type}`, r]),
  );

  return matched
    .filter((r) => {
      const m = meta.get(`${r.tmdb_id}:${r.media_type}`);
      return m ? passesQualityFloor(m) : false;
    })
    .slice(0, limit)
    .map((r) => r.tmdb_id);
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
  const t = fixture.thresholds;
  const gating = fixture.queries.filter((q) => q.gate);
  console.log(
    `Eval over ${fixture.queries.length} queries (${gating.length} gating); ` +
      `thresholds p@10 >= ${t.precisionAt10}, MRR >= ${t.mrr}`,
  );

  let gateP = 0;
  let gateMRR = 0;
  const diagnostics: string[] = [];

  for (const entry of fixture.queries) {
    const expectedIds = entry.expected.map((e) => e.tmdbId);
    let p = 0;
    let rr = 0;
    let topPreview = 'error';
    try {
      const embedding = await embedQuery(entry.query);
      const returnedIds = await retrieveTopN(embedding, 50);
      p = precisionAt10(returnedIds, expectedIds);
      rr = reciprocalRank(returnedIds, expectedIds);
      topPreview = returnedIds.slice(0, 5).join(',');
    } catch (err) {
      console.error(`  "${entry.query}" failed:`, err);
    }

    const label = entry.gate ? 'GATE' : 'diag';
    const line =
      `  [${label}] "${truncate(entry.query, 56)}"  p@10=${p.toFixed(2)}  ` +
      `rr=${rr.toFixed(2)}  top5=${topPreview}`;
    if (entry.gate) {
      gateP += p;
      gateMRR += rr;
      console.log(line);
    } else {
      diagnostics.push(line);
    }
  }

  if (diagnostics.length > 0) {
    console.log('');
    console.log('Diagnostic entries (reported, not gated — see FixtureEntry.gate):');
    for (const line of diagnostics) console.log(line);
  }

  if (gating.length === 0) {
    console.error('');
    console.error('FAIL — no gating entries in the fixture; nothing was actually asserted.');
    process.exit(1);
  }

  const meanP = gateP / gating.length;
  const meanMRR = gateMRR / gating.length;

  console.log('');
  console.log(`Gating mean precision@10: ${meanP.toFixed(3)}  (threshold ${t.precisionAt10})`);
  console.log(`Gating mean MRR:          ${meanMRR.toFixed(3)}  (threshold ${t.mrr})`);

  const passP = meanP >= t.precisionAt10;
  const passMRR = meanMRR >= t.mrr;
  if (!passP || !passMRR) {
    console.error('');
    console.error('FAIL — semantic search eval below threshold.');
    if (!passP) console.error(`  precision@10 ${meanP.toFixed(3)} < ${t.precisionAt10}`);
    if (!passMRR) console.error(`  MRR ${meanMRR.toFixed(3)} < ${t.mrr}`);
    process.exit(1);
  }
  console.log('');
  console.log('PASS');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

main().catch((err) => {
  console.error('Eval rig crashed:', err);
  process.exit(2);
});
