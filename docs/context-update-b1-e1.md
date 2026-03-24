# Videx B1-E1 Context Update — API Consolidation, Content Cache & Deep Linking

**Date:** March 2026
**Commit:** `aa90375` on `main`

## What Changed

### WatchMode Removed, Streaming Availability API Added

- **WatchMode API** has been fully removed (client deleted, all references cleaned up)
- **Streaming Availability API** (Movie of the Night, via RapidAPI) replaces it for:
  - Deep link URLs (exact links to streaming apps)
  - Rent/buy pricing (£ amounts where available)
  - Streaming availability data for 9 of 10 UK services
- **SA API key** is server-side only (`SA_API_KEY`, no `VITE_` prefix) — never bundled into client code
- The app reads SA API data from **Supabase** (cached), not directly from the API

### Supabase Content Cache

New Supabase tables store cached content data:
- **`titles`** — 20,000 TMDb titles with metadata, IMDb IDs, OMDB ratings
- **`streaming_availability`** — ~40,000 deep link entries with pricing (one row per title-service-type-quality combo)
- **`title_genres`**, **`title_credits`** — schema exists but not yet populated
- **`sync_log`** — sync run tracking

**RLS policies:** `anon` + `authenticated` = SELECT only, `service_role` = ALL. The `authenticated` policy was a critical fix — without it, signed-in users got empty results silently.

### Sync Pipeline

- **Bulk sync:** `npx tsx scripts/sync-content.ts` with stages: `--stage tmdb`, `--stage imdb`, `--stage sa`, `--stage omdb`
- **Daily incremental:** Supabase Edge Function at `supabase/functions/sync-incremental/index.ts` using SA API `/changes` endpoint
- **Monitoring views:** `sync_history`, `data_freshness`, `deep_link_coverage`, `ratings_coverage`

### Deep Linking

Service pills on the Detail Page are now tappable — they open the streaming app directly via Android App Links.

**Implementation:**
- `src/lib/deepLinks.ts` — resolves exact SA API link or search URL fallback per service
- `src/lib/openDeepLink.ts` — uses `@capacitor/app-launcher` (`AppLauncher.openUrl()`) on native, `window.open()` on web
- `src/components/DetailPage.tsx` — `WhereToWatch` pills are `<button>` elements with `ExternalLink` icon and press animation

**Per-service status on Android:**
| Service | Deep link | Method |
|---|---|---|
| Netflix | Opens app to title | App Links (verified domain) |
| Disney+ | Opens app to title | App Links |
| Channel 4 | Opens app | `/programmes/slug-year` URL |
| Prime Video | Opens in Chrome | No reliable Android deep link format exists |
| BBC iPlayer | Opens in Chrome | SA API catalogue empty, search fallback |
| Sky Go | Opens in Chrome | Not in SA API, Google site search |
| Apple TV, NOW, ITVX, Paramount+ | Opens via SA API deep link | App Links where supported |

**Prime Video limitation:** Amazon's Prime Video app has no public deep link format for detail pages on Android. `amazon.co.uk` opens the Shopping app, `app.primevideo.com` gives PARSE_ERROR, `primevideo.com` opens Chrome. This is a known industry-wide issue. Would work better on iOS via Universal Links.

### Pricing Display

- Rent/buy pills show `"Rent from £3.49"` or `"Buy from £4.99"` when SA API has pricing
- When no price available: `"Buy — check price"` label (user can still tap to open service)
- Rent prices: 100% coverage. Buy prices: ~62% coverage (Apple/Prime)

### SA API UK Service Coverage

| SA API slug | Service | Videx ServiceId | Status |
|---|---|---|---|
| `netflix` | Netflix | `netflix` | Full coverage |
| `prime` | Prime Video | `prime` | Full coverage |
| `disney` | Disney+ | `disney` | Full coverage |
| `apple` | Apple TV | `apple` | Full coverage |
| `itvx` | ITVX | `itvx` | Full coverage |
| `paramount` | Paramount+ | `paramount` | Full coverage |
| `now` | Now | `now` | Full coverage |
| `all4` | Channel 4 | `channel4` | Full coverage |
| `iplayer` | BBC iPlayer | `bbc` | Empty catalogue (GitHub issue filed) |
| — | Sky Go | `skygo` | Not in SA API |

SA-to-Videx mapping is duplicated in 3 files (keep in sync):
- `src/lib/adapters/platformAdapter.ts`
- `scripts/sync-content.ts`
- `supabase/functions/sync-incremental/index.ts`

## New Files

| File | Purpose |
|---|---|
| `src/lib/api/streamingAvailability.ts` | SA API types + client (server-side only) |
| `src/lib/api/supabaseContent.ts` | Reads streaming links from Supabase with 24h client cache |
| `src/lib/deepLinks.ts` | Deep link resolution (exact link → search fallback) |
| `src/lib/openDeepLink.ts` | Platform-aware URL opener (AppLauncher / window.open) |
| `scripts/sync-content.ts` | Bulk content sync (TMDb → SA API → OMDB) |
| `supabase/functions/sync-incremental/index.ts` | Daily incremental sync Edge Function |
| `supabase/migrations/001-005` | Schema, constraint fixes, monitoring, data quality, RLS |
| `docs/solutions/` | 3 solution docs (RLS bug, cache bug, SA API coverage) |

## Key Patterns & Gotchas

- **Supabase RLS**: Always add policies for BOTH `anon` AND `authenticated` roles. Signed-in users query as `authenticated`, not `anon`. Missing policy = silent empty results.
- **Capacitor deep linking**: Do NOT use `@capacitor/browser` (`Browser.open()`) — it opens Chrome Custom Tabs which bypass App Links. Use `@capacitor/app-launcher` (`AppLauncher.openUrl()`) instead.
- **SA API key**: Must NOT have `VITE_` prefix. Server-side only (sync scripts + Edge Functions).
- **Client-side cache**: Streaming links use `sa_` prefix in localStorage, 24h TTL. One-time cache flush on app load via `sa_cache_flushed_v1` flag.
- **Price formatting**: Always format from `price_amount` (numeric) as `£X.XX`, not from `price_formatted` (which returns `"X.XX GBP"` format).
- **Channel 4 URLs**: Use `/programmes/{slug-year}` format, built from title + year.
- **Prime Video**: `FORCE_SEARCH_FALLBACK` set in `deepLinks.ts` — always uses search URL instead of SA API deep link.

## Completed Since Initial Deployment

### Final tasks (commit `d004a58`)
- **B1.7:** pg_cron daily sync scheduled at 06:00 UTC (migration 006)
- **C1.1:** Exponential backoff retry (3 attempts, 1s→2s→4s) added to both Edge Function and bulk sync script
- **C1.3:** Data quality SQL functions deployed — `run_data_quality_check()` detects missing availability, orphaned rows, stale data, TMDb confirmation gaps
- **Dashboard query:** `supabase/queries/dashboard.sql` — combined health check
- **Edge Function deployed** with retry logic and auth check
- **Supabase CLI** connected to project `fmusugdcnnwiuzkbjquo`

### Bug fixes applied during device testing
- **RLS `authenticated` policy missing** — signed-in users got empty results from content cache tables. Fixed in migration 005. Critical lesson: always add policies for both `anon` AND `authenticated` roles.
- **Deep link opener** — `@capacitor/browser` (`Browser.open()`) bypasses Android App Links. Switched to `@capacitor/app-launcher` (`AppLauncher.openUrl()`) which uses ACTION_VIEW intent.
- **Prime Video** — no reliable Android deep link format exists. `FORCE_SEARCH_FALLBACK` in `deepLinks.ts` always uses `primevideo.com/search` URL (opens in Chrome). Would work on iOS via Universal Links.
- **Channel 4 slug** — uses `/programmes/{title-slug-year}` format with year from DetailData.
- **Price formatting** — always formats from `price_amount` as `£X.XX`, not from SA API's `"X.XX GBP"` format. Missing prices show "Buy — check price".
- **Stale SA cache** — one-time flush on app load via `sa_cache_flushed_v1` localStorage flag.

### Data quality baseline (from `run_data_quality_check()`)
- 3,560 titles with IMDb ID but no SA API data (niche/older content — normal)
- 0 orphaned availability rows (clean data integrity)
- 1,544 stale entries from initial test batch (will be refreshed by daily cron)
- 16,152 TMDb-unconfirmed entries (expected — `tmdb_confirmed` not yet populated)

## Remaining Operational Tasks

- Run OMDB ratings daily (`npx tsx scripts/sync-content.ts --stage omdb`) until all 20K titles covered (~20 days at 950/day cap)
- Downgrade SA API from Pro to free tier (initial population complete)
- Monitor daily cron sync via `SELECT * FROM sync_history;` in SQL Editor
