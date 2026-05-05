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
 * Request shape:
 *   POST /functions/v1/label-anchor-room
 *   Authorization: Bearer <user JWT> (anon clients use the public anon key)
 *   {
 *     anchor: { tmdbId: number, mediaType: 'movie'|'tv', title: string, year: number|null },
 *     topTitles: [{ title: string, year: number|null }, ...]   // up to 8
 *   }
 *
 * Response shape:
 *   200 { label: string, description: string|null, cached: boolean }
 *   400 { error: string }   // bad input
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

// ── Config ───────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mirrors the global mood-rooms cron's banned vocabulary (label.py).
// Keep this in sync if the cron list changes — see Parking-Lot IN-461.
const FORBIDDEN_WORDS = new Set([
  'whispers', 'echoes', 'shadows', 'whimsical', 'tales', 'chronicles',
  'realm', 'allure', 'reverie', 'dreamscape', 'odyssey', 'tapestry',
  'unleashed', 'unveiled',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Types ────────────────────────────────────────────────

interface RequestBody {
  anchor: {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    year: number | null;
  };
  topTitles: Array<{ title: string; year: number | null }>;
}

// ── Helpers ──────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function validateBody(body: unknown): RequestBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const a = b.anchor as Record<string, unknown> | undefined;
  if (
    !a
    || typeof a.tmdbId !== 'number'
    || (a.mediaType !== 'movie' && a.mediaType !== 'tv')
    || typeof a.title !== 'string'
    || (a.year != null && typeof a.year !== 'number')
  ) return null;
  if (!Array.isArray(b.topTitles)) return null;
  for (const t of b.topTitles) {
    if (!t || typeof t !== 'object') return null;
    const tr = t as Record<string, unknown>;
    if (typeof tr.title !== 'string') return null;
    if (tr.year != null && typeof tr.year !== 'number') return null;
  }
  return body as RequestBody;
}

function buildPrompt(req: RequestBody): { system: string; user: string } {
  const yearStr = req.anchor.year ? ` (${req.anchor.year})` : '';
  const neighbours = req.topTitles
    .slice(0, 8)
    .map((t) => `- ${t.title}${t.year ? ` (${t.year})` : ''}`)
    .join('\n');

  const system = `You are naming a "mood room" — a small curated set of films or TV shows sharing a feeling, era, or style.

Generate:
- label: 2-4 words, Title Case, evocative but specific. NOT a generic genre name ("Drama Room", "Comedy Room"). NOT generic vocabulary like "Whispers", "Echoes", "Shadows", "Tales", "Chronicles", "Realm", "Allure", "Reverie", "Dreamscape", "Odyssey", "Tapestry", "Unleashed", "Unveiled", "Whimsical".
- description: ONE sentence, max 18 words. Describes the vibe of the room.

The room is anchored on a single title. The neighbours share its feeling.

Respond ONLY as JSON: {"label": "...", "description": "..."}`;

  const user = `Anchor: ${req.anchor.title}${yearStr}

Nearest neighbours by embedding similarity:
${neighbours}

Generate the room label and description.`;

  return { system, user };
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { total_tokens: number };
}

async function callOpenAI(req: RequestBody): Promise<{ label: string; description: string | null } | null> {
  const { system, user } = buildPrompt(req);

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid json' });
  }

  const validated = validateBody(body);
  if (!validated) {
    return jsonResponse(400, { error: 'invalid request body' });
  }

  // Cache hit?
  const { data: cached } = await supabase
    .from('mood_room_anchor_labels')
    .select('label, description')
    .eq('anchor_tmdb_id', validated.anchor.tmdbId)
    .eq('anchor_media_type', validated.anchor.mediaType)
    .maybeSingle();

  if (cached) {
    return jsonResponse(200, {
      label: cached.label,
      description: cached.description,
      cached: true,
    });
  }

  // Generate via OpenAI.
  const generated = await callOpenAI(validated);
  if (!generated) {
    return jsonResponse(500, { error: 'label generation failed' });
  }

  // Upsert. Two requests racing for the same anchor will both call
  // OpenAI (small wasteful cost, accepted) but only one row lands.
  const { error: upsertErr } = await supabase
    .from('mood_room_anchor_labels')
    .upsert({
      anchor_tmdb_id: validated.anchor.tmdbId,
      anchor_media_type: validated.anchor.mediaType,
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
