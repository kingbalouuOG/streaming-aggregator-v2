# Phase PLAT-2 — API Edge & Content Proxy: Implementation Plan

**Status:** DRAFT v1 — awaiting Joe's review. No code written.
**Branch:** `phase-plat-2-api-proxy` (from `main` @ `973c545`, the PLAT-1 merge, 2026-06-11)
**Brief:** E&P brief §6 (authoritative). Locked D2: **Cloudflare Workers + Hono**; locked D6: plain `workers/api/` folder (stub README landed in REPO-1).
**Why now:** PLAT-1 made every client data path a queryFn — the repoints in §3 are genuinely one-liners. PLAT-2 stands up the Worker infrastructure PLAT-3's feed endpoint will live in.

## 0. Recon (2026-06-11)

Client API surface to proxy: **13 TMDb functions** (`configuration`, `discover/movie|tv`, `movie|tv/{id}` details, `search/movie|tv|multi`, `movie|tv/{id}/similar`, `…/recommendations`, `{type}/{id}/watch/providers`) + **OMDB `getRatings`** (sole live OMDB consumer — the acclaimed row reads synced `imdb_rating` from Supabase). Image URL builders (`image.tmdb.org`) are keyless CDN paths — stay direct. Supabase content reads stay client→Supabase (brief §6.3-5).

## 1. Worker design (`workers/api/`)

- **Scaffold:** Hono app, `wrangler.toml` (`name = "videx-api"`, current `compatibility_date`), `src/index.ts`, its own minimal `package.json` (hono; wrangler as devDep) — npm-workspace-free per D6. `GET /v1/health` for smoke.
- **`GET /v1/title/:type/:id`** — the value-add merge: one upstream TMDb detail call (`append_to_response=credits,external_ids,watch/providers`) + OMDB ratings (when `imdb_id` exists), merged into one payload. `Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400` via the Cache API. Kills the detail page's two-query chain (client's OMDB query folds in — useContentDetail gets simpler).
- **`GET /v1/tmdb/*`** — allowlisted GET passthrough for the rest of the inventory (Q4): exact-prefix allowlist (discover/search/similar/recommendations/watch-providers/configuration/trending), key injected server-side, per-prefix TTLs: search+discover **3600s**, similar+recommendations **86400s**, watch/providers **21600s**, configuration **7d**. Anything off-allowlist → 404. No `/v1/omdb` route — OMDB exists only inside the title merge (YAGNI).
- **Secrets:** `TMDB_API_KEY`, `OMDB_API_KEY` as Worker secrets (`wrangler secret put`, Joe — same gate class as repo secrets).
- **CI:** `.github/workflows/deploy-worker.yml` — wrangler deploy on merge to `main`, path-filtered to `workers/api/**`, soft-skip until `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets exist (house pattern).
- **Tier:** free (100k req/day vs 2 prototype users); Workers Paid ~£4/mo starts at PLAT-3 per the locked cost note. **workers.dev subdomain** for now (Q2).

## 2. Client repoint + key removal (two separate commits, deliberately)

1. **Repoint commit:** `tmdb.ts` base URL → `${VITE_API_PROXY_URL}/v1/tmdb`, key param dropped from requests (Worker injects); `getRatings` callers fold into the `/v1/title` payload (useContentDetail: detail+OMDB queries become one `['tmdb','title',type,id]` query); `omdb.ts` shrinks to the score-parsing helpers. Query keys/namespaces unchanged → persistence + TTL behaviour identical. Keys still present in env at this commit — app works in both modes during rollout.
2. **Key-deletion commit** (after the deployed Worker passes the device smoke): `VITE_TMDB_API_KEY` / `VITE_OMDB_API_KEY` deleted from `.env` usage, `.env.example`, and the vite config; **acceptance grep of `dist/`** recorded in the commit message. → **Q3: rotate both keys after merge** — every previously shipped APK embeds the old ones; rotation is the actual security win, deletion alone is cosmetic.

## 3. Acceptance (brief §6.4) and measurement

| Criterion | Method |
|---|---|
| No TMDb/OMDB keys in `dist/` | `grep` both key values + `VITE_TMDB`/`VITE_OMDB` in `dist/` post-build, recorded in summary |
| Cache-hit ratio on `/v1/title/*` | Cloudflare dashboard analytics after a day of prototype use (expect very high warm) |
| p95 detail latency ≤ direct baseline | Scripted N×curl from here against Worker vs TMDb direct, plus device feel check |
| Client TMDb/OMDB volume → ~zero | TMDb account dashboard request stats pre/post week |

## 4. Commit sequence

1. Worker scaffold + health + CI workflow (soft-skip).
2. `/v1/title` merge endpoint.
3. `/v1/tmdb/*` allowlist passthrough + TTL table (+ light unit tests on the pure allowlist/TTL logic).
4. **Joe checkpoint:** Cloudflare account + `wrangler login`/API token + repo secrets + `wrangler secret put` × 2 + first deploy; curl smoke + latency comparison.
5. Client repoint (keys still present).
6. Device smoke via proxy → key deletion + dist grep + `.env.example`.
7. Close-out: acceptance evidence, phase summary, wiki ingest, PR. (Key rotation lands post-merge, Joe.)

## 5. Risks

| Risk | Mitigation |
|---|---|
| Worker outage = content dead (no fallback once keys are gone) | Two-commit rollout (§2); workers.dev SLA is fine at prototype scale; PLAT-3 makes the Worker load-bearing anyway — better to learn its failure modes now |
| TTL drift vs old client semantics | Worker TTLs ≤ client query staleTimes, so the client cache remains the binding layer it already is |
| CORS / WebView quirks | Hono cors middleware, `https://localhost` + capacitor origins allowed; verified in the device smoke |
| Wrangler/CI auth friction | Soft-skip workflow merges safely before secrets exist; manual `wrangler deploy` is the fallback path |

## 6. Open questions for Joe

1. **Cloudflare account** — do you have one? Phase needs: account + API token (Workers edit scope), `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` repo secrets, and two `wrangler secret put` runs — all yours (established permission gates). I script everything scriptable.
2. **workers.dev subdomain** for now (recommended; custom domain is a launch-prep item).
3. **Rotate TMDb + OMDB keys post-merge** (recommended — shipped APKs embed the current ones).
4. **Allowlisted `/v1/tmdb/*` passthrough** for the non-title endpoints instead of 12 bespoke routes (recommended — same caching, ~10× less route code; `/v1/title` stays the one genuinely merged endpoint).
