/**
 * Offline Evaluation Harness — Phase 4
 *
 * Runs the full ranking pipeline against a real user's data and outputs
 * scored results + row assignments for manual inspection.
 *
 * Usage:
 *   npx tsx scripts/evaluation/rank-eval.ts --user-id <uuid>
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env file.
 * Not a test suite — a diagnostic tool for inspecting ranker behavior.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env from project root (run from project root via npx tsx)
function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env');
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
const supabaseUrl = ENV.VITE_SUPABASE_URL;
const supabaseKey = ENV.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Parse CLI args
const args = process.argv.slice(2);
const userIdIdx = args.indexOf('--user-id');
if (userIdIdx === -1 || !args[userIdIdx + 1]) {
  console.error('Usage: npx tsx scripts/evaluation/rank-eval.ts --user-id <uuid>');
  process.exit(1);
}
const userId = args[userIdIdx + 1];

// ── Scoring functions (duplicated from pipeline for standalone use) ──

function distanceToSimilarity(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance / 2));
}

function computeForYouRecencyScore(releaseDate: string | null, halfLifeDays = 180): number {
  if (!releaseDate) return 0.5;
  const parsed = new Date(releaseDate);
  if (isNaN(parsed.getTime())) return 0.5;
  const daysSince = (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 0) return 1.0;
  return Math.exp(-0.693 * daysSince / halfLifeDays);
}

function getModulatedWeights(catalogueAgeSlider: number) {
  const rawRecency = 0.30 - catalogueAgeSlider * 0.20;
  const nonRecencyBudget = 1.0 - rawRecency;
  const contextual = nonRecencyBudget / 6; // 5:1 ratio
  const taste = nonRecencyBudget - contextual;
  return { taste, recency: rawRecency, contextual };
}

function parseRtScore(rtScore: string | null | undefined): number {
  if (!rtScore) return 0.5;
  const match = rtScore.match(/^(\d+)%?$/);
  if (!match) return 0.5;
  return Math.min(1.0, Math.max(0.0, parseInt(match[1], 10) / 100));
}

// ── Main ──

async function main() {
  console.log(`\n=== Videx v2 Ranking Pipeline Evaluation ===`);
  console.log(`User ID: ${userId}\n`);

  // 1. Fetch user profile
  const { data: profile, error: profileErr } = await supabase
    .from('taste_profiles')
    .select('taste_vector_v2, slider_catalogue_age, slider_comfort_zone, slider_content_mix, slider_variety, taste_vector_interaction_count, taste_vector_bootstrapped_from, selected_clusters')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileErr || !profile) {
    console.error('Failed to fetch taste profile:', profileErr?.message ?? 'No profile found');
    process.exit(1);
  }

  const tasteVector: number[] | null = profile.taste_vector_v2
    ? JSON.parse(profile.taste_vector_v2 as string)
    : null;

  if (!tasteVector) {
    console.error('User has no taste vector. Complete onboarding first.');
    process.exit(1);
  }

  const sliders = {
    catalogueAge: profile.slider_catalogue_age ?? 0.5,
    comfortZone: profile.slider_comfort_zone ?? 0.25,
    contentMix: profile.slider_content_mix ?? 0.5,
    variety: profile.slider_variety ?? 0.5,
  };

  console.log('Slider state:', sliders);
  console.log('Interaction count:', profile.taste_vector_interaction_count);
  console.log('Bootstrap source:', profile.taste_vector_bootstrapped_from);
  console.log('Selected clusters:', profile.selected_clusters);
  console.log(`Taste vector: ${tasteVector.length}D\n`);

  // 2. Fetch user interactions
  const { data: interactions } = await supabase
    .from('user_interactions')
    .select('event_type, content_id, media_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  const interactionSummary: Record<string, number> = {};
  for (const i of (interactions ?? [])) {
    interactionSummary[i.event_type] = (interactionSummary[i.event_type] ?? 0) + 1;
  }
  console.log('Interaction summary:', interactionSummary);

  // 3. Fetch candidates via RPC
  const vectorStr = `[${tasteVector.join(',')}]`;
  const { data: matched, error: rpcErr } = await supabase
    .rpc('match_titles_by_vector', {
      query_vector: vectorStr,
      match_limit: 500,
    });

  if (rpcErr || !matched) {
    console.error('RPC failed:', rpcErr?.message);
    process.exit(1);
  }

  console.log(`\nStage 1: Retrieved ${matched.length} candidates from vector search\n`);

  // 4. Fetch metadata
  const tmdbIds = matched.map((m: any) => m.tmdb_id);
  const { data: titleData } = await supabase
    .from('titles')
    .select('tmdb_id, media_type, title, release_date, release_year, genre_ids, vote_average, vote_count, popularity, rt_score, imdb_rating, director, cast_top_5')
    .in('tmdb_id', tmdbIds);

  const metaMap = new Map<string, any>();
  for (const row of (titleData ?? [])) {
    metaMap.set(`${row.media_type}-${row.tmdb_id}`, row);
  }

  // 5. Score candidates
  const weights = getModulatedWeights(sliders.catalogueAge);
  console.log('Stage 2 weights:', weights);

  const scored = matched
    .map((m: any) => {
      const key = `${m.media_type}-${m.tmdb_id}`;
      const meta = metaMap.get(key);
      if (!meta) return null;

      const taste = distanceToSimilarity(m.distance);
      const recency = computeForYouRecencyScore(meta.release_date);
      const contextual = 0.5; // placeholder

      const finalScore =
        weights.taste * taste +
        weights.recency * recency +
        weights.contextual * contextual;

      return {
        key,
        title: meta.title,
        mediaType: m.media_type,
        year: meta.release_year,
        scores: { taste, recency, contextual },
        finalScore,
        popularity: meta.popularity,
        voteAverage: meta.vote_average,
        rtScore: meta.rt_score,
        imdbRating: meta.imdb_rating,
        genres: meta.genre_ids,
        director: meta.director,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.finalScore - a.finalScore);

  // 6. Output top 50
  console.log(`\n=== Top 50 Scored Candidates ===\n`);
  console.log(`${'#'.padStart(3)} | ${'Score'.padStart(6)} | ${'Taste'.padStart(6)} | ${'Recncy'.padStart(6)} | ${'Pop'.padStart(7)} | ${'IMDb'.padStart(5)} | ${'RT'.padStart(4)} | Title`);
  console.log('-'.repeat(100));

  for (let i = 0; i < Math.min(50, scored.length); i++) {
    const c = scored[i]!;
    const rt = c.rtScore ? parseRtScore(c.rtScore).toFixed(2) : ' N/A';
    const imdb = c.imdbRating != null ? c.imdbRating.toFixed(1) : ' N/A';
    console.log(
      `${String(i + 1).padStart(3)} | ${c.finalScore.toFixed(4)} | ${c.scores.taste.toFixed(4)} | ${c.scores.recency.toFixed(4)} | ${String(c.popularity?.toFixed(1) ?? 'N/A').padStart(7)} | ${imdb.padStart(5)} | ${rt.padStart(4)} | ${c.title} (${c.year ?? '?'}) [${c.mediaType}]`
    );
  }

  // 7. Row assignments
  console.log(`\n=== Row Assignments ===\n`);

  // Recommended For You: top 20
  const recForYou = scored.slice(0, 20);
  console.log(`Recommended For You (${recForYou.length}):`);
  recForYou.forEach((c: any, i: number) => console.log(`  ${i + 1}. ${c.title} (${c.year}) — score ${c.finalScore.toFixed(4)}`));

  // Hidden Gems
  const gems = scored.filter((c: any) =>
    c.popularity >= 2 && c.popularity <= 20 &&
    (c.voteAverage ?? 0) >= 7.0
  ).slice(0, 15);
  console.log(`\nHidden Gems (${gems.length}):`);
  gems.forEach((c: any, i: number) => console.log(`  ${i + 1}. ${c.title} (${c.year}) — score ${c.finalScore.toFixed(4)}, pop ${c.popularity}`));

  // Outside Your Usual
  const cosineScores = scored.map((c: any) => c.scores.taste);
  cosineScores.sort((a: number, b: number) => a - b);
  const cosine30th = cosineScores[Math.floor(cosineScores.length * 0.3)] ?? 0;
  const medianFinal = [...scored].sort((a: any, b: any) => a.finalScore - b.finalScore)[Math.floor(scored.length / 2)]?.finalScore ?? 0;

  const comfortCount = 5 + Math.round(sliders.comfortZone * 10);
  const outside = scored.filter((c: any) =>
    c.scores.taste <= cosine30th &&
    c.finalScore >= medianFinal &&
    (c.imdbRating == null || c.imdbRating >= 7.0)
  ).slice(0, comfortCount);
  console.log(`\nOutside Your Usual (${outside.length}, comfort zone slider=${sliders.comfortZone}):`);
  outside.forEach((c: any, i: number) => console.log(`  ${i + 1}. ${c.title} (${c.year}) — taste ${c.scores.taste.toFixed(4)}, final ${c.finalScore.toFixed(4)}`));

  // Diversity metrics
  console.log(`\n=== Diversity Metrics (Top 20) ===\n`);
  const top20 = scored.slice(0, 20);
  const genreDist = new Map<number, number>();
  const typeDist = { movie: 0, tv: 0 };
  for (const c of top20) {
    const pg = (c.genres ?? [])[0];
    if (pg) genreDist.set(pg, (genreDist.get(pg) ?? 0) + 1);
    if (c.mediaType === 'movie') typeDist.movie++;
    else typeDist.tv++;
  }

  console.log('Genre distribution:', Object.fromEntries(genreDist));
  console.log('Distinct genres:', genreDist.size);
  console.log('Media type:', typeDist);
  console.log(`Movie ratio: ${(typeDist.movie / 20 * 100).toFixed(0)}%`);

  console.log(`\n=== Evaluation Complete ===\n`);
}

main().catch(console.error);
