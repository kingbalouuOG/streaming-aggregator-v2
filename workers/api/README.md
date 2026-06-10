# workers/api — Cloudflare Worker (PLAT-2 lands here)

Created empty in REPO-1 (E&P brief §4.3-3) so PLAT-2 lands into an
agreed location. Plain folder, not a workspace split — locked decision
D6 (orchestration v0.8 §11): workspace split only if a second app
target ever appears.

What arrives in PLAT-2 (brief §6):

- Hono app deployed via wrangler, CI deploy on merge.
- `GET /v1/title/:type/:id` — merged TMDb detail + OMDB ratings,
  CDN-cached (`s-maxage=86400, stale-while-revalidate=86400`).
- `GET /v1/discover` / `/v1/search` / `/v1/trending` — shorter s-maxage.
- TMDb + OMDB keys become Worker secrets; `VITE_TMDB_API_KEY` /
  `VITE_OMDB_API_KEY` leave the client bundle.

PLAT-3 then adds `GET /v1/foryou` (single server-side engine + feed
cache), importing `src/lib/recommendations-v2/` directly — wrangler
bundles from anywhere in the repo, which is what dissolves the ADR-011
`_shared/` mirror.

Until PLAT-2: nothing in here runs; no wrangler config exists yet.
