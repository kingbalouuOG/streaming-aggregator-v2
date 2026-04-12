/**
 * Refresh Service Fingerprints Edge Function (Phase 2)
 *
 * Recomputes 1536D centroid vectors for each streaming service from their
 * top-N most popular catalogue titles. Runs weekly (Sunday 07:00 UTC) via
 * pg_cron, after the daily content pipeline (sync → enrich → embed) has
 * settled.
 *
 * Service count is small (~10), each requiring only DB reads + vector math.
 * Total runtime is well under the 2-minute Edge Function timeout.
 *
 * Deploy: npx supabase functions deploy refresh-service-fingerprints --project-ref fmusugdcnnwiuzkbjquo
 * Manual: curl -X POST https://<project>.supabase.co/functions/v1/refresh-service-fingerprints \
 *           -H "Authorization: Bearer <service_role_key>"
 *
 * Required Supabase Functions env vars (auto-provided):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeCentroid } from '../_shared/centroidMath.ts';

// ── Config ─────────────────────────────────────���─────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TOP_N = 150;
const IN_BATCH_SIZE = 300;

// ── Title fetching (same logic as build script) ──────────

async function fetchTitlesForPairs(
  pairs: { tmdb_id: number; media_type: string }[],
): Promise<{ id: number; tmdb_id: number; media_type: string; popularity: number; embedding: string }[]> {
  const byType = new Map<string, number[]>();
  for (const p of pairs) {
    const arr = byType.get(p.media_type) || [];
    arr.push(p.tmdb_id);
    byType.set(p.media_type, arr);
  }

  const results: { id: number; tmdb_id: number; media_type: string; popularity: number; embedding: string }[] = [];

  for (const [mediaType, tmdbIds] of byType) {
    const uniqueIds = [...new Set(tmdbIds)];

    for (let i = 0; i < uniqueIds.length; i += IN_BATCH_SIZE) {
      const batch = uniqueIds.slice(i, i + IN_BATCH_SIZE);
      const { data, error } = await supabase
        .from('titles')
        .select('id, tmdb_id, media_type, popularity, embedding')
        .in('tmdb_id', batch)
        .eq('media_type', mediaType)
        .not('embedding', 'is', null)
        .gte('vote_count', 50)
        .order('popularity', { ascending: false });

      if (error) throw new Error(`titles query (${mediaType}): ${error.message}`);
      if (data) results.push(...data);
    }
  }

  return results;
}

// ── Process one service ──────────────────────────────���───

async function processService(serviceId: string): Promise<{ title_count: number } | null> {
  // Fetch (tmdb_id, media_type) pairs from streaming_availability
  const saPairs: { tmdb_id: number; media_type: string }[] = [];
  let saOffset = 0;
  const SA_PAGE_SIZE = 1000;

  while (true) {
    const { data: saPage, error: saErr } = await supabase
      .from('streaming_availability')
      .select('tmdb_id, media_type')
      .eq('service_id', serviceId)
      .in('stream_type', ['subscription', 'free'])
      .range(saOffset, saOffset + SA_PAGE_SIZE - 1);

    if (saErr) throw new Error(`SA query for ${serviceId}: ${saErr.message}`);
    if (!saPage || saPage.length === 0) break;
    saPairs.push(...saPage);
    if (saPage.length < SA_PAGE_SIZE) break;
    saOffset += SA_PAGE_SIZE;
  }

  // Deduplicate (a title can have both subscription + free entries)
  const seen = new Set<string>();
  const uniquePairs = saPairs.filter(p => {
    const key = `${p.tmdb_id}:${p.media_type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniquePairs.length === 0) return null;

  // Fetch titles with embeddings, split by media_type
  const allTitles = await fetchTitlesForPairs(uniquePairs);
  if (allTitles.length === 0) return null;

  // Sort by popularity, take top N
  allTitles.sort((a, b) => b.popularity - a.popularity);
  const topTitles = allTitles.slice(0, TOP_N);

  // Parse embeddings and compute centroid
  const vectors: number[][] = [];
  const titleIds: number[] = [];

  for (const t of topTitles) {
    const emb = typeof t.embedding === 'string'
      ? JSON.parse(t.embedding)
      : t.embedding;
    vectors.push(emb);
    titleIds.push(t.id);
  }

  const centroid = computeCentroid(vectors);
  const vectorStr = `[${centroid.join(',')}]`;

  // Upsert
  const { error: upsertErr } = await supabase
    .from('service_fingerprints')
    .upsert({
      service_id: serviceId,
      region: 'GB',
      centroid: vectorStr,
      title_count: topTitles.length,
      source_title_ids: titleIds,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'service_id,region' });

  if (upsertErr) throw new Error(`upsert ${serviceId}: ${upsertErr.message}`);

  return { title_count: topTitles.length };
}

// ── Edge Function handler ───────────────���────────────────

Deno.serve(async (req) => {
  // JWT verification — mirrors embed-new-titles/index.ts
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const payload = JSON.parse(atob(authHeader.split(' ')[1].split('.')[1]));
    if (payload.role !== 'service_role') throw new Error('not service_role');
  } catch {
    return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get distinct services
    const { data: serviceRows, error: serviceErr } = await supabase
      .from('streaming_availability')
      .select('service_id')
      .in('stream_type', ['subscription', 'free']);

    if (serviceErr) throw new Error(`service query: ${serviceErr.message}`);

    const services = [...new Set((serviceRows || []).map((r: { service_id: string }) => r.service_id))].sort();

    const details: Record<string, number> = {};
    let processed = 0;
    let failed = 0;

    for (const serviceId of services) {
      try {
        const result = await processService(serviceId);
        if (result) {
          details[serviceId] = result.title_count;
          processed++;
        }
      } catch (err) {
        console.error(`${serviceId}: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }
    }

    console.log(`refresh-service-fingerprints done: processed=${processed} failed=${failed}`);
    return new Response(JSON.stringify({ status: 'ok', services_processed: processed, services_failed: failed, details }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('refresh-service-fingerprints failed:', message);
    return new Response(JSON.stringify({ status: 'error', message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
