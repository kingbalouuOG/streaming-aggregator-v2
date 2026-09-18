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
- `GET /v1/home` — server-side Home aggregator (B5), same auth and rate
  limit as `/v1/foryou`.

Object URLs (Growth S1, ADR-015 — see the wiki `inbound-deep-linking` page):

- `GET /t/:type/:ref` — title share / SEO page. `ref` is `{tmdbId}` or
  `{tmdbId}-{slug}`; resolved by type + id, a missing or stale slug 301s
  to canonical. OG tags, iOS smart banner, deep link, UA-aware store CTA.
- `GET /room/:id` — shared room snapshot page (migration 088).
- `GET /list/:id` — shared household list page (G2 H3, migration 093):
  household name, counts, up to 6 posters, never member names; noindex;
  60 s edge cache (`LIST_PAGE_TTL_SECONDS`); `?invite=` is re-applied to the
  deep link and the Play referrer (`l=`, `i=`) after the cache read.
- `GET /.well-known/apple-app-site-association` and
  `GET /.well-known/assetlinks.json` — universal / app link association
  (src/wellKnown.ts). Fingerprints from `[vars] ASSETLINKS_FINGERPRINTS`.
- `POST /v1/share/room` — snapshot a room (Supabase JWT, 30/min per user).
- `GET /v1/room/:id` — snapshot JSON for the app.
- `GET /v1/list/:id/preview` — public list preview JSON
  `{ id, name, household_name, count, posters, members }`, 60 s edge cache,
  404 JSON when unknown (the app's signed-out list screen).

Growth telemetry (Growth S2, migration 090 `growth_events`):

- `POST /v1/growth/events` — app events (`link_opened`, `first_open`,
  `signup_completed`; S4 adds `share_*`, `notification_opened`). Body
  validated in src/growthEvents.ts against the shared contract
  (src/lib/growth/growthEvents.ts); an optional Bearer Supabase JWT sets
  `user_id`. `GROWTH_RATELIMIT` 60/60s keyed on the install id, else
  `cf-connecting-ip`. 204 / 400 / 413 / 429.
- `/t/` and `/room/` pages record `preview_fetched` (crawler) or
  `preview_opened` (person) per served GET 200 via `waitUntil`, after the
  cache read, classified by src/uaClass.ts. Their Play link's referrer also
  names the object (`t=movie-603` / `r={roomId}`) for the Android deferred
  deep link. No new zone route: `/v1/*` already reaches the Worker.

Page caching: 24h Cache API keyed by object id + platform bucket + `PAGE_CACHE_VERSION` (bump it when page markup changes);
`?via=` / `?src=` are filled into the app deep link and Play referrer
after the cache read (src/pageShell.ts `applyAttribution`).

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

Growth S1 adds four more, **registered by Joe in the dashboard** (they
are not live until then; without them Vercel answers 404):

    videxstreaming.com/.well-known/*
    videxstreaming.com/room/*
    videxstreaming.com/list/*
    videxstreaming.com/delete-account*   (served since launch, never routed)

**Standing rule: any NEW public path added to this Worker (e.g. the H1
`/out` affiliate redirector) needs a matching route added in the
Cloudflare dashboard, or requests fall through to the marketing site.**
Routes are dashboard-managed on purpose — do NOT add `routes` to
wrangler.toml: the CI deploy token is Workers-scoped (no zone
permissions) and the deploy would fail. The `*.workers.dev` URL remains
live as a fallback origin.
