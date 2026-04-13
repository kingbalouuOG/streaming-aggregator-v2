/**
 * Phase 2.5 — Pre-flight TMDb Provider ID Verification (WU-0)
 *
 * Queries TMDb's provider list endpoints for GB and prints the resolved
 * IDs for BBC iPlayer, NOW, and Sky Go. Pauses for confirmation before
 * any downstream backfill proceeds.
 *
 * Hard stop: if ANY of the three providers is missing from the TMDb
 * response, the script halts. No silent two-service fallback.
 *
 * Usage:
 *   npx tsx scripts/fingerprints/preflight-tmdb-providers.ts
 *
 * Prerequisites (.env):
 *   VITE_TMDB_API_KEY
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';

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

if (!TMDB_API_KEY) {
  console.error('Missing VITE_TMDB_API_KEY in .env');
  process.exit(1);
}

// ── TMDb helpers ─────────────────────────────────────────

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_DELAY = 260;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tmdbFetch(path: string): Promise<any> {
  await delay(TMDB_DELAY);
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('watch_region', 'GB');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDb ${res.status}: ${path}`);
  return res.json();
}

// ── Expected providers ───────────────────────────────────

// These are the IDs from platformAdapter.ts. This script verifies them
// against the live TMDb API rather than trusting hardcoded values.
const EXPECTED = [
  { name: 'BBC iPlayer', expectedId: 38, serviceId: 'bbc' },
  { name: 'NOW',         expectedId: 39, serviceId: 'now' },
  { name: 'Sky Go',      expectedId: 29, serviceId: 'skygo' },
];

const SEARCH_TERMS = [
  'bbc iplayer', 'bbc',
  'now',
  'sky go', 'sky',
];

// ── Main ─────────────────────────────────────────────────

interface ProviderMatch {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  endpoint: string;
}

async function main(): Promise<void> {
  console.log('Phase 2.5 — Pre-flight TMDb Provider ID Verification');
  console.log();

  const endpoints = [
    { path: '/watch/providers/movie', label: 'movie' },
    { path: '/watch/providers/tv',    label: 'tv' },
  ];

  // Collect all provider results from both endpoints
  const allProviders = new Map<string, ProviderMatch[]>(); // keyed by expected name

  for (const expected of EXPECTED) {
    allProviders.set(expected.name, []);
  }

  for (const ep of endpoints) {
    console.log(`Fetching ${ep.label} providers...`);
    const data = await tmdbFetch(ep.path);
    const results: any[] = data.results || [];

    for (const expected of EXPECTED) {
      // Search by exact ID match first
      const byId = results.find((r: any) => r.provider_id === expected.expectedId);
      if (byId) {
        allProviders.get(expected.name)!.push({
          provider_id: byId.provider_id,
          provider_name: byId.provider_name,
          logo_path: byId.logo_path,
          endpoint: ep.label,
        });
        continue;
      }

      // Fallback: fuzzy name search
      const nameLower = expected.name.toLowerCase();
      const byName = results.find((r: any) =>
        r.provider_name.toLowerCase().includes(nameLower) ||
        nameLower.includes(r.provider_name.toLowerCase())
      );
      if (byName) {
        allProviders.get(expected.name)!.push({
          provider_id: byName.provider_id,
          provider_name: byName.provider_name,
          logo_path: byName.logo_path,
          endpoint: ep.label,
        });
      }
    }
  }

  // Print results
  console.log();
  console.log('='.repeat(80));
  console.log('RESOLVED PROVIDER IDS');
  console.log('='.repeat(80));
  console.log();

  let allFound = true;
  const missingProviders: string[] = [];

  for (const expected of EXPECTED) {
    const matches = allProviders.get(expected.name)!;
    console.log(`${expected.name} (Videx: ${expected.serviceId}, expected ID: ${expected.expectedId}):`);

    if (matches.length === 0) {
      console.log(`  NOT FOUND in either movie or TV endpoint`);
      allFound = false;
      missingProviders.push(expected.name);
    } else {
      for (const m of matches) {
        const idMatch = m.provider_id === expected.expectedId ? 'MATCH' : 'MISMATCH';
        console.log(`  [${m.endpoint}] ID: ${m.provider_id} (${idMatch}) — "${m.provider_name}" — logo: ${m.logo_path || 'none'}`);
      }

      // Check for ID mismatches
      const mismatch = matches.find(m => m.provider_id !== expected.expectedId);
      if (mismatch) {
        console.log(`  WARNING: TMDb ID ${mismatch.provider_id} does not match expected ${expected.expectedId}`);
      }

      // Check if movie vs TV IDs differ
      const movieMatch = matches.find(m => m.endpoint === 'movie');
      const tvMatch = matches.find(m => m.endpoint === 'tv');
      if (movieMatch && tvMatch && movieMatch.provider_id !== tvMatch.provider_id) {
        console.log(`  WARNING: Movie ID (${movieMatch.provider_id}) differs from TV ID (${tvMatch.provider_id})`);
      }
    }
    console.log();
  }

  // Hard stop if any provider is missing
  if (!allFound) {
    console.log('='.repeat(80));
    console.log('HARD STOP');
    console.log('='.repeat(80));
    for (const name of missingProviders) {
      console.log(`  ${name} not found in TMDb GB providers.`);
      console.log(`  The entire ${name} arm of Phase 2.5 is non-viable.`);
      console.log(`  Halting. Discuss alternatives with Joe before proceeding.`);
    }
    process.exit(1);
  }

  // Check for any ID mismatches
  let hasMismatch = false;
  for (const expected of EXPECTED) {
    const matches = allProviders.get(expected.name)!;
    if (matches.some(m => m.provider_id !== expected.expectedId)) {
      hasMismatch = true;
    }
  }

  if (hasMismatch) {
    console.log('WARNING: One or more provider IDs do not match expected values.');
    console.log('Review the mismatches above before confirming.');
    console.log();
  }

  // Pause for confirmation
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question('Confirm these IDs are correct? Press Enter to continue, Ctrl+C to abort. ', () => {
      rl.close();
      resolve();
    });
  });

  console.log();
  console.log('Provider IDs confirmed. Proceed with WU-1 (backfill script).');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
