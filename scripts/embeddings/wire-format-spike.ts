/**
 * Phase 1 — pgvector Wire Format Spike (IN-203)
 *
 * Validates the runtime format of pgvector columns as returned by the
 * Supabase JS client. The result determines the locked pattern Phase 3
 * uses for client-side embedding access.
 *
 * Usage:
 *   npx tsx scripts/embeddings/wire-format-spike.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
const supabase = createClient(ENV.VITE_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY);

async function main(): Promise<void> {
  console.log('pgvector Wire Format Spike (IN-203)\n');

  // Pick 10 titles with embeddings
  const { data, error } = await supabase
    .from('titles')
    .select('tmdb_id, title, embedding')
    .not('embedding', 'is', null)
    .limit(10);

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.error('No rows with embeddings found');
    process.exit(1);
  }

  console.log(`Fetched ${data.length} rows\n`);

  for (const row of data) {
    const emb = row.embedding;
    console.log(`tmdb_id=${row.tmdb_id} (${row.title}):`);
    console.log(`  typeof:       ${typeof emb}`);
    console.log(`  Array.isArray: ${Array.isArray(emb)}`);
    console.log(`  constructor:  ${emb?.constructor?.name ?? 'N/A'}`);

    if (typeof emb === 'string') {
      console.log(`  length (str): ${emb.length}`);
      console.log(`  first 80 chars: ${emb.slice(0, 80)}...`);

      // Try parsing
      try {
        const parsed = JSON.parse(emb);
        console.log(`  JSON.parse:   success, ${Array.isArray(parsed) ? 'array' : typeof parsed}, length=${parsed.length}`);
        console.log(`  first 3 values: [${parsed.slice(0, 3).join(', ')}]`);
      } catch (e) {
        console.log(`  JSON.parse:   failed (${e instanceof Error ? e.message : String(e)})`);
      }
    } else if (Array.isArray(emb)) {
      console.log(`  length (arr): ${emb.length}`);
      console.log(`  first 3 values: [${emb.slice(0, 3).join(', ')}]`);
      console.log(`  element type: ${typeof emb[0]}`);
    }
    console.log('');
  }

  // Summary verdict
  const sample = data[0].embedding;
  console.log('=== VERDICT ===');
  if (typeof sample === 'string') {
    console.log('Format: STRING (PostgREST-serialized)');
    console.log('Workaround needed: JSON.parse(embedding) to get number[]');
    console.log('Locked pattern: const vec: number[] = JSON.parse(row.embedding);');
  } else if (Array.isArray(sample) && typeof sample[0] === 'number') {
    console.log('Format: number[] (auto-parsed by Supabase JS client)');
    console.log('No workaround needed: direct client access works');
    console.log('Locked pattern: const vec: number[] = row.embedding;');
  } else {
    console.log(`Format: UNEXPECTED (${typeof sample})`);
    console.log('Investigation needed before Phase 3');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
