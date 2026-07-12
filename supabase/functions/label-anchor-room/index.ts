/**
 * Label Anchor Room Edge Function (IN-463)
 *
 * Generates a thematic name + one-sentence description for an anchored
 * mood room on the For You surface. Replaces the v1 literal "If you
 * love {anchor}" labelling.
 *
 * Cache: mood_room_anchor_labels (migration 034). Keyed on (anchor_tmdb_id,
 * anchor_media_type). Shared across users — once generated for The
 * Hangover, every user with The Hangover as an anchor reads the cache.
 *
 * Security (pre-launch review 2026-07-12): the function is signed-in-only
 * (PR #73) AND derives every LLM input SERVER-SIDE. The caller supplies
 * only the anchor's (tmdbId, mediaType); the anchor title + neighbour
 * titles are looked up from `titles` + the same vector neighbourhood the
 * client renders (match_titles_by_vector). No client-supplied text ever
 * reaches the OpenAI prompt, so an authenticated user cannot prompt-inject
 * a poisoned label into the shared cache every user reads. A per-user
 * in-memory rate limit bounds the OpenAI bill on the cold-generation path.
 *
 * Request shape:
 *   POST /functions/v1/label-anchor-room
 *   Authorization: Bearer <user JWT>
 *   { anchor: { tmdbId: number, mediaType: 'movie'|'tv' } }
 *
 * (Legacy clients also send anchor.title/year + topTitles[]; those fields
 *  are IGNORED — the server no longer trusts them.)
 *
 * Response shape:
 *   200 { label: string, description: string|null, cached: boolean }
 *   400 { error: string }   // bad input
 *   401 { error: string }   // no / invalid user JWT
 *   404 { error: string }   // anchor tmdbId/mediaType not in `titles`
 *   429 { error: string }   // per-user generation rate limit
 *   500 { error: string }   // OpenAI failure / DB failure
 *
 * Deploy: npx supabase functions deploy label-anchor-room --project-ref fmusugdcnnwiuzkbjquo
 *
 * Required Functions secrets (set via `supabase secrets set`):
 *   - OPENAI_API_KEY
 * (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-provided)
 *
 * The function uses the service-role client to write the cache (bypassing
 * RLS) but only reads/writes its own row per request. It does not expose
 * the service-role key to the caller.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { extractUserIdFromJwt } from '../_shared/userScope.ts';

// ── Config ───────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

/** Neighbours passed to the prompt (mirrors the client's top-8 slice). */
const NEIGHBOUR_COUNT = 8;
/**
 * NN over-fetch from match_titles_by_vector. We only need NEIGHBOUR_COUNT
 * after dropping the anchor itself, but over-fetch a little for headroom
 * against nulls. The RPC floors hnsw.ef_search at 100 (migration 025), so
 * a small match_limit still returns quality neighbours.
 */
const NEIGHBOUR_MATCH_LIMIT = 25;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mirrors the global mood-rooms cron's banned vocabulary (label.py).
// Keep this in sync if the cron list changes — see Parking-Lot IN-461.
const FORBIDDEN_WORDS = new Set([
  'whispers', 'echoes', 'shadows', 'whimsical', 'tales', 'chronicles',
  'realm', 'allure', 'reverie', 'dreamscape', 'odyssey', 'tapestry',
  'unleashed', 'unveiled',
]);

// ── Per-user rate limit ──────────────────────────────────
//
// Only the cold path (cache miss → OpenAI call) is limited, so ordinary
// cache-hit reads are never throttled. Bounds the OpenAI bill against an
// authenticated user enumerating valid tmdbIds to force generations.
// In-memory + per-isolate (same best-effort caveat as embed-query's LRU);
// Supabase may run several isolates, so this caps per-isolate throughput,
// not a global hard ceiling. Good enough to defang cheap enumeration.

const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_MAX_GENERATIONS = 20; // cold generations per user per window

const generationLog = new Map<string, number[]>();

/** Returns true if the user is under the limit (and records the hit). */
function allowGeneration(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const hits = (generationLog.get(userId) ?? []).filter((t) => t > cutoff);
  if (hits.length >= RATE_MAX_GENERATIONS) {
    generationLog.set(userId, hits);
    return false;
  }
  hits.push(now);
  generationLog.set(userId, hits);
  return true;
}

// ── Types ────────────────────────────────────────────────

interface AnchorRef {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

interface DerivedInputs {
  anchor: { title: string; year: number | null };
  neighbours: Array<{ title: string; year: number | null }>;
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Validate the request. We require ONLY the anchor identity; any
 * client-supplied title/topTitles are ignored (server derives them).
 */
function parseAnchorRef(body: unknown): AnchorRef | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const a = b.anchor as Record<string, unknown> | undefined;
  if (
    !a
    || typeof a.tmdbId !== 'number'
    || !Number.isInteger(a.tmdbId)
    || (a.mediaType !== 'movie' && a.mediaType !== 'tv')
  ) return null;
  return { tmdbId: a.tmdbId, mediaType: a.mediaType };
}

/**
 * Derive the anchor title + representative neighbour titles from the
 * database — the SAME data the client renders (anchoredRoom.ts): the
 * anchor's embedding neighbourhood via match_titles_by_vector.
 *
 * Returns null if the anchor doesn't exist or has no usable embedding
 * (caller maps this to a 404).
 */
async function deriveAnchorInputs(anchor: AnchorRef): Promise<DerivedInputs | null> {
  // 1. Verify the anchor exists + pull its title/year/embedding.
  const { data: anchorRows, error: anchorErr } = await supabase
    .from('titles')
    .select('title, release_year, embedding')
    .eq('tmdb_id', anchor.tmdbId)
    .eq('media_type', anchor.mediaType)
    .limit(1);

  if (anchorErr) {
    console.error('label-anchor-room: anchor lookup failed:', anchorErr.message);
    return null;
  }
  const anchorRow = anchorRows?.[0] as
    | { title: string | null; release_year: number | null; embedding: string | null }
    | undefined;
  if (!anchorRow || !anchorRow.title) return null;

  const anchorInfo = { title: anchorRow.title, year: anchorRow.release_year ?? null };

  // 2. Neighbours via the anchor's embedding. If the anchor has no
  //    embedding we can still label from the title alone.
  let neighbours: Array<{ title: string; year: number | null }> = [];
  if (anchorRow.embedding) {
    let embedding: number[] | null = null;
    try {
      embedding = JSON.parse(anchorRow.embedding);
    } catch {
      console.error('label-anchor-room: failed to parse anchor embedding');
    }

    if (Array.isArray(embedding)) {
      const vectorStr = `[${embedding.join(',')}]`;
      const { data: matched, error: rpcErr } = await supabase.rpc('match_titles_by_vector', {
        query_vector: vectorStr,
        match_limit: NEIGHBOUR_MATCH_LIMIT,
      });

      if (rpcErr) {
        console.error('label-anchor-room: match_titles_by_vector failed:', rpcErr.message);
      } else if (Array.isArray(matched)) {
        const rows = matched as Array<{ tmdb_id: number; title: string; media_type: string }>;
        const topNeighbours = rows
          .filter((r) => !(r.tmdb_id === anchor.tmdbId && r.media_type === anchor.mediaType))
          .filter((r) => typeof r.title === 'string' && r.title.length > 0)
          .slice(0, NEIGHBOUR_COUNT);

        // Enrich with release years in one lookup (RPC omits year).
        const yearById = await fetchNeighbourYears(topNeighbours.map((r) => r.tmdb_id));
        neighbours = topNeighbours.map((r) => ({
          title: r.title,
          year: yearById.get(`${r.media_type}-${r.tmdb_id}`) ?? null,
        }));
      }
    }
  }

  return { anchor: anchorInfo, neighbours };
}

/** Batch-fetch release_year for neighbour tmdbIds. Keyed `${media}-${id}`. */
async function fetchNeighbourYears(tmdbIds: number[]): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (tmdbIds.length === 0) return map;
  const ids = [...new Set(tmdbIds)];
  const { data, error } = await supabase
    .from('titles')
    .select('tmdb_id, media_type, release_year')
    .in('tmdb_id', ids);
  if (error || !data) return map;
  for (const row of data as Array<{ tmdb_id: number; media_type: string; release_year: number | null }>) {
    map.set(`${row.media_type}-${row.tmdb_id}`, row.release_year ?? null);
  }
  return map;
}

function buildPrompt(inputs: DerivedInputs): { system: string; user: string } {
  const yearStr = inputs.anchor.year ? ` (${inputs.anchor.year})` : '';
  const neighbours = inputs.neighbours
    .map((t) => `- ${t.title}${t.year ? ` (${t.year})` : ''}`)
    .join('\n');

  const system = `You are naming a "mood room" — a small curated set of films or TV shows sharing a feeling, era, or style.

Generate:
- label: 2-4 words, Title Case, evocative but specific. NOT a generic genre name ("Drama Room", "Comedy Room"). NOT generic vocabulary like "Whispers", "Echoes", "Shadows", "Tales", "Chronicles", "Realm", "Allure", "Reverie", "Dreamscape", "Odyssey", "Tapestry", "Unleashed", "Unveiled", "Whimsical".
- description: ONE sentence, max 18 words. Describes the vibe of the room.

The room is anchored on a single title. The neighbours share its feeling.

Respond ONLY as JSON: {"label": "...", "description": "..."}`;

  const user = `Anchor: ${inputs.anchor.title}${yearStr}

Nearest neighbours by embedding similarity:
${neighbours || '- (none available)'}

Generate the room label and description.`;

  return { system, user };
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { total_tokens: number };
}

async function callOpenAI(inputs: DerivedInputs): Promise<{ label: string; description: string | null } | null> {
  const { system, user } = buildPrompt(inputs);

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.6,
    max_tokens: 100,
  };

  let response: Response;
  try {
    response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('label-anchor-room: OpenAI fetch failed:', err);
    return null;
  }

  if (!response.ok) {
    console.error(`label-anchor-room: OpenAI HTTP ${response.status}:`, (await response.text()).slice(0, 200));
    return null;
  }

  const parsed = (await response.json()) as OpenAIChatResponse;
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) {
    console.error('label-anchor-room: OpenAI returned empty content');
    return null;
  }

  let result: { label?: unknown; description?: unknown };
  try {
    result = JSON.parse(content);
  } catch {
    console.error('label-anchor-room: OpenAI returned non-JSON:', content.slice(0, 200));
    return null;
  }

  const label = typeof result.label === 'string' ? result.label.trim() : '';
  const description = typeof result.description === 'string' ? result.description.trim() : '';

  if (!label || label.length > 80) {
    console.error('label-anchor-room: invalid label:', label);
    return null;
  }

  // Forbidden-vocabulary check (mirrors the cron labeller).
  const tokens = new Set(label.toLowerCase().split(/\s+/).map((t) => t.replace(/[^a-z]/g, '')));
  for (const t of tokens) {
    if (FORBIDDEN_WORDS.has(t)) {
      console.error(`label-anchor-room: label "${label}" contains forbidden word "${t}"`);
      return null;
    }
  }

  return { label, description: description || null };
}

// ── Handler ──────────────────────────────────────────────

Deno.serve(async (req) => {
  // Per-request CORS lookup. See _shared/cors.ts for allow-list rules.
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);
  const jsonResponse = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed' });
  }

  // Require a real signed-in user, not just the bundled anon key: this
  // function writes into a cache EVERY user reads
  // (mood_room_anchor_labels) and each uncached call costs an OpenAI
  // request. Anonymous callers could run up the bill untraceably
  // (pre-launch security review 2026-07-12). Same pattern as embed-query.
  const userId = extractUserIdFromJwt(req);
  if (!userId) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid json' });
  }

  const anchor = parseAnchorRef(body);
  if (!anchor) {
    return jsonResponse(400, { error: 'invalid request body' });
  }

  // Cache hit? (unlimited — no OpenAI cost)
  const { data: cached } = await supabase
    .from('mood_room_anchor_labels')
    .select('label, description')
    .eq('anchor_tmdb_id', anchor.tmdbId)
    .eq('anchor_media_type', anchor.mediaType)
    .maybeSingle();

  if (cached) {
    return jsonResponse(200, {
      label: cached.label,
      description: cached.description,
      cached: true,
    });
  }

  // Cold path — an OpenAI call is about to happen. Rate-limit per user.
  if (!allowGeneration(userId)) {
    return jsonResponse(429, { error: 'too many label generations, try again shortly' });
  }

  // Derive every prompt input server-side. The client's title/topTitles
  // (if any) are never read — this is the prompt-injection fix.
  const inputs = await deriveAnchorInputs(anchor);
  if (!inputs) {
    return jsonResponse(404, { error: 'anchor not found' });
  }

  // Generate via OpenAI.
  const generated = await callOpenAI(inputs);
  if (!generated) {
    return jsonResponse(500, { error: 'label generation failed' });
  }

  // Upsert. Two requests racing for the same anchor will both call
  // OpenAI (small wasteful cost, accepted) but only one row lands.
  const { error: upsertErr } = await supabase
    .from('mood_room_anchor_labels')
    .upsert({
      anchor_tmdb_id: anchor.tmdbId,
      anchor_media_type: anchor.mediaType,
      label: generated.label,
      description: generated.description,
      openai_model: OPENAI_MODEL,
    }, { onConflict: 'anchor_tmdb_id,anchor_media_type' });

  if (upsertErr) {
    console.error('label-anchor-room: cache upsert failed:', upsertErr.message);
    // Still return the generated label — the user gets the right
    // result even if our cache write failed. Next request will retry
    // the upsert via the same path.
  }

  return jsonResponse(200, {
    label: generated.label,
    description: generated.description,
    cached: false,
  });
});
