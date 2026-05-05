/**
 * IN-466 candidate-pool payload size measurement.
 *
 * Reconstructs the CandidatePool shape that fetchCandidatePool() produces
 * for a real user, then measures the JSON payload size (raw + gzipped) the
 * Edge Function would ship back to the client.
 *
 * This decides whether we ship the full pool in the response (Cowork
 * green-lit at <150KB gzipped) or design a stripped PoolItem shape with
 * a poolVersion field as the cheaper escape hatch.
 *
 * Run:
 *   node scripts/_measure_foryou_pool_size.mjs <user_id>
 *
 * The user_id is the auth.uid() to measure against (Joe's account is the
 * natural test bed — find it in Supabase Auth → Users).
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.
 *
 * Throwaway. Delete after the result is recorded in IN-466 phase summary.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { gzipSync } from 'zlib';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1).replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const ENV = loadEnv();
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? ENV.SUPABASE_URL;
const SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node scripts/_measure_foryou_pool_size.mjs <user_id>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Mirrors the EXTENDED_TITLE_SELECT constant in src/lib/recommendations-v2/types.ts.
// Keep in sync if that constant changes.
const EXTENDED_TITLE_SELECT =
  'tmdb_id, media_type, title, poster_path, release_date, release_year, ' +
  'vote_average, vote_count, popularity, runtime, original_language, ' +
  'genre_ids, director, cast_top_5, imdb_rating';

const DEFAULT_CANDIDATE_LIMIT = 500;

function fmt(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  console.log(`Measuring CandidatePool size for user ${userId}\n`);

  // 1. Fetch the user's taste vector.
  const { data: profile, error: profileErr } = await supabase
    .from('taste_profiles')
    .select('taste_vector_v2')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileErr || !profile?.taste_vector_v2) {
    console.error('Could not load taste profile:', profileErr?.message ?? 'no row');
    process.exit(1);
  }

  // pgvector serialises as a JSON string — parse if needed.
  const tasteVector = typeof profile.taste_vector_v2 === 'string'
    ? JSON.parse(profile.taste_vector_v2)
    : profile.taste_vector_v2;

  console.log(`Loaded ${tasteVector.length}-dim taste vector\n`);

  // 2. Run the same RPC fetchCandidatePool calls.
  const vectorStr = `[${tasteVector.join(',')}]`;
  const { data: matched, error: rpcErr } = await supabase.rpc('match_titles_by_vector', {
    query_vector: vectorStr,
    match_limit: DEFAULT_CANDIDATE_LIMIT,
  });

  if (rpcErr || !matched) {
    console.error('match_titles_by_vector failed:', rpcErr?.message);
    process.exit(1);
  }

  console.log(`RPC returned ${matched.length} candidates`);

  // 3. Fetch extended metadata for top 100 (matches fetchCandidatePool behaviour).
  const metadataIds = [...new Set(matched.slice(0, 100).map((t) => t.tmdb_id))];
  const { data: metaRows, error: metaErr } = await supabase
    .from('titles')
    .select(EXTENDED_TITLE_SELECT)
    .in('tmdb_id', metadataIds);

  if (metaErr) {
    console.error('metadata fetch failed:', metaErr.message);
    process.exit(1);
  }

  console.log(`Fetched extended metadata for ${metaRows.length} titles\n`);

  // 4. Reconstruct the CandidatePool wire shape.
  // The client-side type uses Map<string, ExtendedTitleRow> for metadata —
  // serialise as a plain object (the natural Edge Function payload shape).
  const metadataObj = {};
  for (const row of metaRows) {
    metadataObj[`${row.media_type}-${row.tmdb_id}`] = row;
  }

  const fullPool = {
    matched, // 500 × { tmdb_id, media_type, distance } — slim
    metadata: metadataObj, // 100 × ExtendedTitleRow — fat
    fetchedAt: Date.now(),
  };

  // Stripped PoolItem shape that rerank() actually needs (Cowork's escape
  // hatch). Drops poster_path, cast, director, etc — keeps only what
  // scoreCandidates and the row builders consume.
  const strippedPool = {
    matched,
    metadata: Object.fromEntries(
      Object.entries(metadataObj).map(([k, v]) => [k, {
        tmdb_id: v.tmdb_id,
        media_type: v.media_type,
        title: v.title,
        release_date: v.release_date,
        release_year: v.release_year,
        vote_average: v.vote_average,
        vote_count: v.vote_count,
        popularity: v.popularity,
        genre_ids: v.genre_ids,
        imdb_rating: v.imdb_rating,
      }]),
    ),
    fetchedAt: Date.now(),
    poolVersion: 1,
  };

  // 5. Measure.
  const fullJson = JSON.stringify(fullPool);
  const fullGz = gzipSync(fullJson);
  const stripJson = JSON.stringify(strippedPool);
  const stripGz = gzipSync(stripJson);

  console.log('Pool sizes\n----------');
  console.log(`Full pool      raw:  ${fmt(Buffer.byteLength(fullJson))}`);
  console.log(`Full pool      gzip: ${fmt(fullGz.length)}`);
  console.log(`Stripped pool  raw:  ${fmt(Buffer.byteLength(stripJson))}`);
  console.log(`Stripped pool  gzip: ${fmt(stripGz.length)}`);

  console.log('\nDecision');
  console.log('--------');
  if (fullGz.length < 150 * 1024) {
    console.log(`Full pool gzipped is under 150 KB — ship full pool.`);
  } else {
    console.log(`Full pool gzipped exceeds 150 KB — ship stripped PoolItem shape with poolVersion field.`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
