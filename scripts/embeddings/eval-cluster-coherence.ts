/**
 * Phase 1 — Cluster Coherence Evaluation
 *
 * Validates that 1536D OpenAI embeddings produce semantically meaningful
 * clusters. Pulls pre-defined cohorts from the database, computes within-
 * cohort and between-cohort cosine similarities, and outputs a markdown
 * report with pass/fail verdict.
 *
 * Thresholds (from Phase 1 brief):
 *   - Within-cohort mean cosine similarity >= 0.5
 *   - Between-cohort baseline <= 0.3
 *   - Gap >= 0.2
 *
 * Usage:
 *   npx tsx scripts/embeddings/eval-cluster-coherence.ts
 *
 * Output:
 *   docs/v2/phase-1-cluster-eval.md
 *
 * Prerequisites (.env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ── Load env ────────────────────────────────────────────

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

// ── Cohort definitions ──────────────────────────────────

interface Cohort {
  name: string;
  description: string;
  tmdb_ids: number[];
  media_type: 'movie' | 'tv';
}

const COHORTS: Cohort[] = [
  {
    name: 'Christopher Nolan Films',
    description: 'Director-driven cohort (director NOT in embedding template — clusters on genre/overview/keywords/cast overlap)',
    tmdb_ids: [27205, 157336, 155, 374720, 77], // Inception, Interstellar, The Dark Knight, Dunkirk, Memento
    media_type: 'movie',
  },
  {
    name: 'BBC Period Dramas',
    description: 'Genre + production-region driven (TV cohort — tests whether TV titles cluster well without director)',
    tmdb_ids: [33907, 91239, 60574, 62084, 39793, 65494, 67419], // Downton Abbey, Bridgerton, Peaky Blinders, Poldark, Call the Midwife, The Crown, Victoria
    media_type: 'tv',
  },
  {
    name: 'Studio Ghibli',
    description: 'Studio + genre driven (animated Japanese films)',
    tmdb_ids: [129, 8392, 128, 4935, 16859, 12429, 10515], // Spirited Away, Totoro, Mononoke, Howl's, Kiki's, Ponyo, Castle in the Sky
    media_type: 'movie',
  },
  {
    name: 'Conjuring Universe Horror',
    description: 'Franchise horror (studio/franchise + genre overlap)',
    tmdb_ids: [250546, 396422, 406563, 439079, 968051], // Annabelle, Annabelle: Creation, Insidious: Last Key, The Nun, The Nun II
    media_type: 'movie',
  },
  {
    name: 'MCU',
    description: 'Franchise + cast overlap (superhero action)',
    tmdb_ids: [299534, 284054, 118340, 284053, 1726, 100402], // Endgame, Black Panther, GotG, Thor Ragnarok, Iron Man, Cap Winter Soldier
    media_type: 'movie',
  },
  {
    name: 'Incoherent Control',
    description: 'Deliberately diverse: romance, war, western, documentary, anime',
    tmdb_ids: [11036, 857, 429, 664280, 129], // The Notebook, Saving Private Ryan, Good Bad Ugly, Attenborough, Spirited Away
    media_type: 'movie',
  },
];

// ── Math helpers ────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const result = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) result[i] += v[i];
  }
  for (let i = 0; i < dim; i++) result[i] /= vectors.length;
  return result;
}

function pairwiseSimilarities(vectors: number[][]): number[] {
  const sims: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      sims.push(cosineSimilarity(vectors[i], vectors[j]));
    }
  }
  return sims;
}

// ── Fetch embeddings ────────────────────────────────────

async function fetchEmbeddings(tmdbIds: number[], mediaType: string): Promise<Map<number, number[]>> {
  const { data, error } = await supabase
    .from('titles')
    .select('tmdb_id, title, embedding')
    .in('tmdb_id', tmdbIds)
    .eq('media_type', mediaType)
    .not('embedding', 'is', null);

  if (error) throw new Error(`Supabase select failed: ${error.message}`);

  const map = new Map<number, number[]>();
  for (const row of data ?? []) {
    // embedding may come back as string or number[] — handle both
    let vec: number[];
    if (typeof row.embedding === 'string') {
      vec = JSON.parse(row.embedding);
    } else if (Array.isArray(row.embedding)) {
      vec = row.embedding;
    } else {
      console.warn(`  Unexpected embedding type for tmdb_id=${row.tmdb_id}: ${typeof row.embedding}`);
      continue;
    }
    map.set(row.tmdb_id, vec);
  }
  return map;
}

// ── Main ────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Phase 1 cluster coherence evaluation\n');

  const cohortResults: Array<{
    name: string;
    description: string;
    titleCount: number;
    foundCount: number;
    withinMean: number;
    withinMin: number;
    withinMax: number;
    pass: boolean;
  }> = [];

  const centroids: Array<{ name: string; centroid: number[] }> = [];

  for (const cohort of COHORTS) {
    console.log(`Evaluating: ${cohort.name}`);
    const embeddings = await fetchEmbeddings(cohort.tmdb_ids, cohort.media_type);
    console.log(`  Found ${embeddings.size}/${cohort.tmdb_ids.length} titles with embeddings`);

    const vectors = Array.from(embeddings.values());

    if (vectors.length < 2) {
      console.log('  SKIP: need at least 2 vectors for pairwise comparison\n');
      cohortResults.push({
        name: cohort.name,
        description: cohort.description,
        titleCount: cohort.tmdb_ids.length,
        foundCount: vectors.length,
        withinMean: 0,
        withinMin: 0,
        withinMax: 0,
        pass: false,
      });
      continue;
    }

    const sims = pairwiseSimilarities(vectors);
    const withinMean = mean(sims);
    const withinMin = Math.min(...sims);
    const withinMax = Math.max(...sims);

    // For the control set, threshold is inverted: we expect LOW similarity
    const isControl = cohort.name === 'Incoherent Control';
    const pass = isControl ? withinMean <= 0.3 : withinMean >= 0.5;

    console.log(`  Within-cohort mean: ${withinMean.toFixed(4)} [${withinMin.toFixed(4)}, ${withinMax.toFixed(4)}] ${pass ? 'PASS' : 'FAIL'}`);
    console.log('');

    cohortResults.push({
      name: cohort.name,
      description: cohort.description,
      titleCount: cohort.tmdb_ids.length,
      foundCount: vectors.length,
      withinMean,
      withinMin,
      withinMax,
      pass,
    });

    centroids.push({ name: cohort.name, centroid: centroid(vectors) });
  }

  // Between-cohort similarities (centroid-to-centroid)
  console.log('Between-cohort similarities (centroid cosine):');
  const betweenSims: number[] = [];
  const betweenDetails: string[] = [];

  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      if (centroids[i].name === 'Incoherent Control' || centroids[j].name === 'Incoherent Control') continue;
      const sim = cosineSimilarity(centroids[i].centroid, centroids[j].centroid);
      betweenSims.push(sim);
      betweenDetails.push(`  ${centroids[i].name} × ${centroids[j].name}: ${sim.toFixed(4)}`);
      console.log(betweenDetails[betweenDetails.length - 1]);
    }
  }

  const betweenMean = mean(betweenSims);
  const betweenMax = betweenSims.length > 0 ? Math.max(...betweenSims) : 0;
  console.log(`\nBetween-cohort mean: ${betweenMean.toFixed(4)}, max: ${betweenMax.toFixed(4)}`);

  // Overall verdict
  const realCohorts = cohortResults.filter((c) => c.name !== 'Incoherent Control');
  const allWithinPass = realCohorts.every((c) => c.pass);
  const controlPass = cohortResults.find((c) => c.name === 'Incoherent Control')?.pass ?? false;
  const betweenPass = betweenMean <= 0.3;
  const minWithin = Math.min(...realCohorts.map((c) => c.withinMean));
  const gapPass = (minWithin - betweenMax) >= 0.2;
  const overallPass = allWithinPass && controlPass && betweenPass && gapPass;

  console.log(`\nGap (min within - max between): ${(minWithin - betweenMax).toFixed(4)} (need >= 0.2)`);
  console.log(`\nOverall: ${overallPass ? 'PASS' : 'FAIL'}`);

  // ── Generate report ───────────────────────────────────

  const reportLines: string[] = [
    '# Phase 1 — Cluster Coherence Evaluation Report',
    '',
    `**Date:** ${new Date().toISOString().split('T')[0]}`,
    `**Embedding model:** OpenAI text-embedding-3-small (1536D)`,
    `**Template:** Strategy v1.6.3 §4.1 (title, genres, overview, keywords, cast, runtime)`,
    `**Total embedded titles:** 19,993`,
    '',
    '## Thresholds',
    '',
    '| Metric | Threshold | Result | Status |',
    '|--------|-----------|--------|--------|',
    `| Within-cohort mean cosine | >= 0.5 | ${minWithin.toFixed(4)} (weakest cohort) | ${allWithinPass ? 'PASS' : 'FAIL'} |`,
    `| Between-cohort baseline | <= 0.3 | ${betweenMean.toFixed(4)} (mean) | ${betweenPass ? 'PASS' : 'FAIL'} |`,
    `| Gap (min within - max between) | >= 0.2 | ${(minWithin - betweenMax).toFixed(4)} | ${gapPass ? 'PASS' : 'FAIL'} |`,
    `| Control set mean cosine | <= 0.3 | ${cohortResults.find((c) => c.name === 'Incoherent Control')?.withinMean.toFixed(4) ?? 'N/A'} | ${controlPass ? 'PASS' : 'FAIL'} |`,
    '',
    `**Overall verdict: ${overallPass ? 'PASS' : 'FAIL'}**`,
    '',
    '## Per-Cohort Results',
    '',
    '| Cohort | Titles Found | Mean Cosine | Min | Max | Status |',
    '|--------|-------------|-------------|-----|-----|--------|',
  ];

  for (const c of cohortResults) {
    const status = c.name === 'Incoherent Control'
      ? (c.withinMean <= 0.3 ? 'PASS (low = good)' : 'FAIL (too similar)')
      : (c.withinMean >= 0.5 ? 'PASS' : 'FAIL');
    reportLines.push(
      `| ${c.name} | ${c.foundCount}/${c.titleCount} | ${c.withinMean.toFixed(4)} | ${c.withinMin.toFixed(4)} | ${c.withinMax.toFixed(4)} | ${status} |`
    );
  }

  reportLines.push('');
  reportLines.push('### Cohort Descriptions');
  reportLines.push('');
  for (const c of cohortResults) {
    reportLines.push(`- **${c.name}**: ${c.description}`);
  }

  reportLines.push('');
  reportLines.push('## Between-Cohort Similarities');
  reportLines.push('');
  reportLines.push('Centroid-to-centroid cosine similarity (excluding control set):');
  reportLines.push('');
  for (const d of betweenDetails) {
    reportLines.push(d.trim());
  }
  reportLines.push('');
  reportLines.push(`Mean: ${betweenMean.toFixed(4)}, Max: ${betweenMax.toFixed(4)}`);

  reportLines.push('');
  reportLines.push('## IN-PX-06 Assessment');
  reportLines.push('');

  const bbcCohort = cohortResults.find((c) => c.name === 'BBC Period Dramas');
  const movieCohorts = realCohorts.filter((c) => c.name !== 'BBC Period Dramas');
  const movieMean = mean(movieCohorts.map((c) => c.withinMean));

  if (bbcCohort) {
    const tvVsMovie = bbcCohort.withinMean - movieMean;
    reportLines.push(
      `The BBC Period Dramas (TV) cohort achieved a within-cohort mean of ${bbcCohort.withinMean.toFixed(4)}, ` +
      `compared to the movie cohort average of ${movieMean.toFixed(4)} (delta: ${tvVsMovie >= 0 ? '+' : ''}${tvVsMovie.toFixed(4)}).`
    );
    reportLines.push('');
    if (bbcCohort.withinMean >= 0.5) {
      reportLines.push(
        'The TV cohort clusters well without a director signal in the embedding template. ' +
        'IN-PX-06 (widen TV director extraction) is **deferred** — director is not in the current ' +
        'locked template (§4.1), and the data shows TV titles cluster effectively on genre, overview, ' +
        'keywords, and cast alone. The enriched director data remains available if a future template ' +
        'revision justifies adding it.'
      );
    } else {
      reportLines.push(
        'The TV cohort shows weaker clustering than movie cohorts. Further investigation is needed ' +
        'to determine whether this traces to missing director data or to structural genre/overview ' +
        'differences. IN-PX-06 (widen TV director extraction) remains **deferred** pending this analysis, ' +
        'since director is not in the current locked template.'
      );
    }
  }

  reportLines.push('');

  const outputPath = resolve(__dirname, '..', '..', 'docs', 'v2', 'phase-1-cluster-eval.md');
  writeFileSync(outputPath, reportLines.join('\n') + '\n');
  console.log(`\nReport written to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
