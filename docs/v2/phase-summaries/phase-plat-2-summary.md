# Phase PLAT-2 — API Edge & Content Proxy: Summary

**Status:** Complete, 2026-06-12.
**Branch:** `phase-plat-2-api-proxy` (kickoff + 6 implementation commits + close-out).
**Brief:** E&P brief §6 (locked D2: Cloudflare Workers + Hono; D6: plain `workers/api/` folder).
**Plan:** `docs/plans/2026-06-11-001-feat-phase-plat-2-api-proxy-plan.md` — Q1–Q4 resolved per CC recommendations (workers.dev domain at prototype scale; allowlist passthrough; two-step key removal; raw-OMDB-body merge with client-side parsing).

## 1. What shipped

**The Worker (`workers/api/`, deployed at `videx-api.kingbalouu.workers.dev`):** Hono app with `GET /v1/health`, `GET /v1/title/:type/:id` (one TMDb call with credits/external_ids/watch-providers appended + best-effort OMDB ratings, merged server-side, 24h CDN cache), and `GET /v1/tmdb/*` — an allowlisted passthrough covering exactly the client's 14-endpoint TMDb read surface with per-class TTLs (discover/search/trending 1h, per-title 24h, providers 6h, configuration 7d). Keys injected server-side; client-supplied credential params stripped; cache keys normalised (sorted params) so variants share entries; failures never cached; `x-videx-cache` hit/miss header for measurement. Pure rules in `src/rules.ts`, unit-tested from the root vitest rig (154 total). CI deploy on merge via `deploy-worker.yml` (soft-skips until the Cloudflare repo secrets exist — manual `wrangler deploy` covers the interim).

**Client repoint:** `VITE_API_PROXY_URL` set → the axios TMDb client's baseURL becomes `<proxy>/v1/tmdb` and sends no key; `useContentDetail`'s detail + ratings legs fold into ONE `['tmdb','title']` query against the merge endpoint (`videxApi.fetchMergedTitle`, with a direct-mode compose fallback so the hook has one code path); `parseOmdbBody` extracted so one parser serves both paths.

**Keys out of the bundle (acceptance):** the `import.meta.env.VITE_TMDB_API_KEY` / `VITE_OMDB_API_KEY` references are deleted from client code — Vite only inlines referenced vars, so a clean-dist grep shows **zero hits for either key value or var name**. `.env` keeps both for the six server-side sync/enrichment scripts (annotated in `.env.example`).

## 2. Evidence

- **Worker smoke:** title merge cold 372ms → **warm 114ms (cache hit)**, full payload shape verified (TMDb + credits + external_ids + providers + OMDB 8.7 for The Matrix). Guards: off-allowlist 404, malformed id 400, junk `api_key` param stripped.
- **Device smoke:** **188 requests captured via `wrangler tail`** during Joe's live session — Home discover fan-out (PLAT-1's parallel sections visible in the wild), per-item provider checks, fresh search, `/v1/title` detail opens; every response Ok. App behaviour identical.
- **Latency, honestly:** raw passthrough adds ~60ms over direct TMDb from a UK connection (TMDb's own CDN is fast); the wins are the merged endpoint (kills the 300–800ms OMDB leg), keys out of the bundle, and CDN hits shared across users.

## 3. Process notes

1. **Both Worker secrets failed to land from Joe's interactive `wrangler secret put`** (re-upload said "Creating", i.e. they never existed) → first smoke 401s. Re-set piped from `.env` via Git Bash. Pattern now twice-confirmed: interactive/PowerShell secret entry is unreliable on this machine — pipe secrets from files.
2. **The `.env` append bug:** `echo >>` onto a file with no trailing newline glued `VITE_API_PROXY_URL` onto `PARITY_TEST_PASSWORD`'s line — the device ran direct-mode (zero proxy traffic) until a `wrangler tail` vs curl sanity check isolated it. Repaired surgically; lesson: guard appends with a newline check (the later python append does).
3. workers.dev TLS needs ~2 minutes after first subdomain registration before the cert propagates (initial handshake failures are expected).
4. `wrangler tail` is the cheap device-traffic-verification tool — used as the smoke evidence mechanism.

## 4. Joe actions (post-merge)

1. **Rotate both API keys** at TMDb + OMDB (the old values shipped inside every previous APK build), then `cd workers/api && npx wrangler secret put TMDB_API_KEY` (and OMDB) — pipe from a file, don't paste.
2. Optional, enables CI auto-deploys: `gh secret set CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.

## 5. Follow-ups filed

IN-PX-58 (fingerprint "CLASSIC" label vs catalogue-age semantics — carried from PLAT-1 device pass 2). Custom domain for the Worker = launch-prep. PLAT-3 builds `GET /v1/foryou` in this same Worker — the phase that dissolves ADR-011.
