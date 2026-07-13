# workers/api — videx-api Cloudflare Worker

The platform's server-side surface (E&P brief §6–7, locked D2/D6).
Plain folder, not a workspace split — D6: split only if a second app
target ever appears.

Routes (src/index.ts, Hono):

- `GET /v1/health` — deploy smoke probe.
- `GET /v1/title/:type/:id` — merged TMDb detail + OMDB ratings,
  24h CDN cache (PLAT-2).
- `GET /v1/tmdb/*` — allowlisted TMDb passthrough, per-class TTLs
  (src/rules.ts, unit-tested from the root vitest rig) (PLAT-2).
- `GET /v1/foryou` — server-side For You render (PLAT-3). Verifies the
  Supabase JWT against the project JWKS (src/auth.ts), then runs the
  engine imported DIRECTLY from `src/lib/{recommendations-v2,taste-v2}`
  via `src/lib/server/foryouRender.ts` — the single engine tree;
  ADR-014 superseded the ADR-011 mirror. Per-user KV feed cache
  (FORYOU_CACHE, 20 min TTL, keyed user : taste_vector_updated_at :
  sliderHash : services).

Scheduled (wrangler.toml [triggers], 04:00 UTC): nightly stale-profile
recompute — `src/lib/server/staleRecompute.ts` (PLAT-3 W5).

Secrets (`wrangler secret put`, pipe from a file): TMDB_API_KEY,
OMDB_API_KEY, SUPABASE_SERVICE_ROLE_KEY. SUPABASE_URL is a [vars]
entry. Deploys via .github/workflows/deploy-worker.yml on merge.

Local dev: `npm run dev` (use `.dev.vars` for secrets — gitignored);
bundle check: `npm run check`; cron test:
`npx wrangler dev --test-scheduled` + curl `/__scheduled?cron=0+4+*+*+*`.

## Domain routing (post-cutover 2026-07-13 — READ BEFORE ADDING PUBLIC ROUTES)

`videxstreaming.com` is NOT a Worker custom domain any more. The apex
serves the marketing site (separate repo, Next.js + Payload on Vercel,
proxied through Cloudflare). This Worker receives ONLY the paths listed
as dashboard-managed **zone routes** (Workers & Pages → videx-api →
Settings → Domains & Routes):

    videxstreaming.com/v1/*
    videxstreaming.com/t/*
    videxstreaming.com/reset*
    videxstreaming.com/privacy*
    videxstreaming.com/terms*

**Standing rule: any NEW public path added to this Worker (e.g. the H1
`/out` affiliate redirector) needs a matching route added in the
Cloudflare dashboard, or requests fall through to the marketing site.**
Routes are dashboard-managed on purpose — do NOT add `routes` to
wrangler.toml: the CI deploy token is Workers-scoped (no zone
permissions) and the deploy would fail. The `*.workers.dev` URL remains
live as a fallback origin.
