/**
 * eval-moods — offline confidence check for native semantic mood search.
 *
 * For each "Start with a feeling" mood, this embeds the mood phrase
 * (text-embedding-3-small, the same model the embed-query Edge fn uses),
 * runs it through the shared `semanticRetrieval` ranker against the live
 * pgvector index, and prints the top results + quick distribution stats
 * (avg runtime / rating, genre mix). It's the go/no-go gate for flipping
 * the `search_semantic` flag on at launch — no real users needed.
 *
 * It talks to Postgres directly with the service-role key (bypassing the
 * JWT-gated embed-query fn), so it's a pure offline harness.
 *
 * Run:
 *   OPENAI_API_KEY=sk-...           \
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=...   \
 *   npx tsx scripts/search/eval-moods.ts
 *
 * The phrases here MUST stay in sync with native/src/components/BrowsePresearch.tsx.
 */

import { createClient } from '@supabase/supabase-js';

import { GENRE_NAMES } from '../../src/lib/constants/genres';
import { semanticRetrieval } from '../../src/lib/recommendations-v2/search/semanticCore';

const MODEL = 'text-embedding-3-small';
const TOP_N = 15;

// Phrases deliberately avoid words that appear in titles (slow/burn/quiet,
// hit/fast, night/midnight, comfort/warm) — those caused literal title
// matching to dominate the vibe. Described via synonyms instead.
const MOODS: { label: string; phrase: string }[] = [
  { label: 'Slow burn', phrase: 'an understated, meditative drama that unfolds gradually and rewards your attention — thoughtful, restrained, character-driven and emotionally rich' },
  { label: 'High-energy', phrase: 'an exciting, high-energy crowd-pleaser — thrilling, entertaining and effortless to enjoy, an adrenaline-fuelled popcorn film' },
  { label: 'Late-night', phrase: 'an eerie, unsettling and atmospheric horror or thriller — creepy, ominous, mysterious, tense and haunting' },
  { label: 'Comfort', phrase: 'a heartwarming, gentle and uplifting film — sweet, charming, tender and reassuring, an easy and soothing watch' },
];

// Quality floor — drop unrated entries, ultra-low-vote obscurities, and
// sub-40-minute shorts (TV episodes are legitimately short, so only gate
// movies on runtime).
const QUALITY = (m: { vote_average: number | null; vote_count: number | null; media_type: string; runtime: number | null }) =>
  (m.vote_average ?? 0) > 0 &&
  (m.vote_count ?? 0) >= 20 &&
  (m.media_type === 'tv' || (m.runtime ?? 0) >= 40);

function env(name: string, ...fallbacks: string[]): string {
  for (const key of [name, ...fallbacks]) {
    const v = process.env[key];
    if (v) return v;
  }
  console.error(`Missing env: ${name}`);
  process.exit(1);
}

async function embed(phrase: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input: phrase, model: MODEL }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

function avg(nums: number[]): number {
  const v = nums.filter((n) => Number.isFinite(n) && n > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

async function main() {
  const OPENAI_API_KEY = env('OPENAI_API_KEY');
  const SUPABASE_URL = env('SUPABASE_URL', 'VITE_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
  const SERVICE_ROLE = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  for (const mood of MOODS) {
    process.stdout.write(`\n\n=== ${mood.label.toUpperCase()} ===\n"${mood.phrase}"\n\n`);
    const embedding = await embed(mood.phrase, OPENAI_API_KEY);
    // No taste vector (neutral) and no post-filter — this is the pure
    // mood→catalogue mapping, exactly what a fresh user with the flag on sees.
    const ranked = await semanticRetrieval(
      supabase as unknown as Parameters<typeof semanticRetrieval>[0],
      embedding,
      null,
      QUALITY,
      { candidateLimit: 150, resultLimit: TOP_N },
    );

    const genreTally = new Map<string, number>();
    for (const c of ranked) {
      const g = c.meta.genre_ids[0];
      const name = g != null ? (GENRE_NAMES[g] ?? String(g)) : '—';
      genreTally.set(name, (genreTally.get(name) ?? 0) + 1);
    }
    const topGenres = [...genreTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

    ranked.forEach((c, i) => {
      const m = c.meta;
      const yr = m.release_year ?? '—';
      const rt = m.runtime ? `${m.runtime}m` : '—';
      const rating = m.vote_average != null ? m.vote_average.toFixed(1) : '—';
      const g = m.genre_ids[0] != null ? (GENRE_NAMES[m.genre_ids[0]] ?? '') : '';
      process.stdout.write(
        `${String(i + 1).padStart(2)}. ${m.title} (${yr})  ·  ${m.media_type}  ·  ${g}  ·  ${rt}  ·  ★${rating}  ·  rel=${c.relevance.toFixed(3)}\n`,
      );
    });

    process.stdout.write(
      `\n   stats → avg runtime ${avg(ranked.map((c) => c.meta.runtime ?? 0)).toFixed(0)}m` +
        `  ·  avg rating ${avg(ranked.map((c) => c.meta.vote_average ?? 0)).toFixed(1)}` +
        `  ·  genres ${topGenres.map(([n, c]) => `${n}×${c}`).join(', ')}\n`,
    );
  }

  process.stdout.write('\n\nDone. Eyeball each list: do the titles match the feeling?\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
