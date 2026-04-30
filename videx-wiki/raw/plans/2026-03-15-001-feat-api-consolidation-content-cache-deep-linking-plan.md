---
title: "feat: API Consolidation, Content Cache & Deep Linking (B1 → E1)"
type: feat
status: active
date: 2026-03-15
---

# API Consolidation, Content Cache & Deep Linking (B1 → E1)

## Context

Videx currently uses TMDb for streaming availability (via JustWatch `watch/providers`) and WatchMode for rent/buy pricing. This architecture has limitations: no deep links to streaming apps, no cached content database, and WatchMode adds latency + quota constraints for minimal value.

We're replacing WatchMode with the **Streaming Availability API** (SA API by Movie of the Night), building a **Supabase content cache**, and adding **deep linking** so users can tap a service pill and open the streaming app directly.

---

## Codebase Review Summary

### WatchMode References (10 files to update)

| File | What needs changing |
|---|---|
| `src/lib/api/watchmode.ts` | **DELETE entirely** — 154-line client |
| `src/lib/api/cache.ts` | Replace `WATCHMODE` prefix/TTL with `SA` |
| `src/hooks/useContentDetail.ts:4,54-65` | Replace `getTitlePrices` import + call with Supabase streaming links |
| `src/lib/adapters/detailAdapter.ts:81,148-175` | Replace `watchModePrices` param with `streamingLinks` |
| `src/lib/storage.ts:23` | Replace `watchmode_` prefix in quota filter |
| `src/lib/constants/config.ts:15-20` | Replace `WATCHMODE_TTL_HOURS` with `SA_TTL_HOURS` |
| `.env.example` | Replace `VITE_WATCHMODE_API_KEY` with `VITE_SA_API_KEY` |
| `src/vite-env.d.ts:6` | Same type definition swap |
| `README.md` | Update API section |
| `docs/Attributions.md` | Replace WatchMode attribution with SA API |

### Current Data Flow (Detail Page)

```
useContentDetail.ts
  ├─ TMDb detail (append_to_response=credits,watch/providers,external_ids)
  ├─ OMDB ratings (parallel, non-blocking)
  └─ WatchMode pricing (parallel, non-blocking)  ← REPLACING THIS
      ↓
detailAdapter.ts → buildDetailData()
  ├─ TMDb watch/providers.GB → flatrate+free+ads → allServices[]
  ├─ TV networks fallback (when JustWatch data missing)
  ├─ User platform filter → services[]
  └─ WatchMode rent/buy → rentalOptions[]  ← AND THIS
      ↓
DetailPage.tsx → WhereToWatch component
  ├─ Tier 1: User's services (orange glow border)
  ├─ Tier 2: Other services (neutral chips)
  └─ Tier 3: Rent/Buy (collapsible list, 3 shown)
  **NO click handlers currently — all display-only**
```

### Key Existing Patterns to Follow
- **API client pattern**: axios + `cachedRequest` wrapper → `{ success, data, error? }` return type (see `tmdb.ts`)
- **Cache**: `cache.ts` with `CACHE_PREFIXES`, `CACHE_TTL`, `inferTTLFromKey()`, `createCacheKey()`
- **Adapter pattern**: `detailAdapter.ts` bridges raw API → `DetailData` interface
- **Supabase**: Already configured at `src/lib/supabase.ts`, storage ops in `supabaseStorage.ts`
- **Capacitor**: v8, `@capacitor/browser` NOT installed yet

---

## Implementation Plan

### Phase 1: Validate & Consolidate APIs (B1.0, B1.2)

**1a. Create SA API test script** — `src/lib/api/testSaApi.ts`
- Hit SA API with known UK titles (Peaky Blinders, Stranger Things, Game of Thrones, The Boys, The Mandalorian)
- Document exact SA API service IDs for all 10 UK services
- Verify deep link URLs are HTTPS universal links
- Verify rent/buy pricing format
- **This is a throwaway dev script, not shipped**

**1b. Create SA API client** — `src/lib/api/streamingAvailability.ts`
- Follow existing axios + cached request pattern from `tmdb.ts`
- RapidAPI headers: `X-RapidAPI-Key` (from `VITE_SA_API_KEY`), `X-RapidAPI-Host: streaming-availability.p.rapidapi.com`
- Key exports:
  - `fetchShowAvailability(id, country)` — single title by IMDb/TMDb ID
  - `fetchCatalogueChanges(country, changeType, catalogs, ...)` — for incremental sync
  - `searchShowsByFilters(country, options)` — for initial population
- Cache prefix: `sa_`, TTL: 24h
- Return `{ success, data, error? }` consistent with other clients

**1c. Add SA service ID mapping** — `src/lib/adapters/platformAdapter.ts`
- Add `SA_SERVICE_TO_VIDEX: Record<string, ServiceId>` mapping (exact IDs from 1a results)
- Add reverse `VIDEX_TO_SA_SERVICE` mapping
- Add `saServiceToServiceId()` and `serviceIdToSaService()` helper functions

**1d. Remove WatchMode** — all 10 files listed above
- Delete `src/lib/api/watchmode.ts`
- Update `cache.ts`: replace `WATCHMODE` → `SA` in prefixes, TTL, and all filter functions
- Update `storage.ts`: replace `watchmode_` → `sa_` in quota filter
- Update `config.ts`: `WATCHMODE_TTL_HOURS` → `SA_TTL_HOURS`
- Update `vite-env.d.ts`, `.env.example`: swap key names
- Update `README.md`, `docs/Attributions.md`
- **Do NOT touch `useContentDetail.ts` or `detailAdapter.ts` yet** — those change in Phase 5

### Phase 2: Supabase Schema (B1.1)

**2a. Create migration** — `supabase/migrations/001_content_tables.sql`

Tables:
- **`titles`** — TMDb metadata cache (tmdb_id, media_type, title, overview, poster_path, backdrop_path, genre_ids, vote_average, popularity, imdb_id, rt_score, imdb_rating, last_synced_at). Unique on `(tmdb_id, media_type)`.
- **`streaming_availability`** — One row per title-service-type-quality combo (tmdb_id, media_type, service_id, sa_service_id, stream_type, deep_link_url, video_link_url, quality, price_amount, price_currency, price_formatted, addon_id, addon_name, expires_soon, expires_on, last_verified_at). Unique on `(tmdb_id, media_type, service_id, stream_type, quality)`.
- **`title_genres`** — Genre mapping. PK on `(tmdb_id, media_type, genre_id)`.
- **`title_credits`** — Cast/directors. Unique on `(tmdb_id, media_type, person_name, role)`.
- **`sync_log`** — Sync tracking (sync_type, source, status, titles_processed/added/updated/removed, errors, error_details JSONB).

RLS: `SELECT` allowed for `anon` key on `titles` and `streaming_availability`. All writes restricted to `service_role` (Edge Functions only).

Indexes: tmdb_id+media_type lookups, popularity DESC, service_id, stale data (last_verified_at ASC), expiring content.

### Phase 3: Sync Job — Initial Population (B1.3)

**3a. Create full sync Edge Function** — `supabase/functions/sync-content/index.ts` (Deno)

Three stages:
1. **TMDb catalogue pull** — Discover endpoint for all UK providers, paginate, upsert `titles` + fetch external_ids for IMDb IDs
2. **SA API availability** — For each title with IMDb ID, fetch `GET /shows/{imdb_id}?country=gb`, upsert `streaming_availability` with deep links, pricing, quality
3. **OMDB ratings** — For titles with IMDb ID, fetch RT/IMDb scores, update `titles`. Batch across days (1000/day OMDB limit)

Rate limiting: TMDb 40/10s, SA API 10/s (conservative), OMDB 950/day batch. `Promise.allSettled` for parallel within limits. Resumable via cursor in `sync_log`.

**Requires SA API Pro upgrade ($29/month) for initial population — drop back to free after.**

### Phase 4: Cache Management (B1.4, C1.2, C1.1)

**4a. TTL SQL functions** — Postgres functions to identify stale records:
- `get_stale_titles(limit)` — metadata older than 7 days
- `get_stale_availability(limit)` — availability older than 24 hours
- `get_stale_ratings(limit)` — ratings older than 30 days or missing

**4b. Incremental sync Edge Function** — `supabase/functions/sync-incremental/index.ts`
- Uses SA API `GET /changes` endpoint with `country=gb`
- Fetches only new/updated/removed/expiring since last sync
- Processes each change type: upsert for new/updated, delete for removed
- Reads last sync timestamp from `sync_log`

**4c. Schedule via pg_cron** — Daily at 06:00 UTC

**4d. Monitoring queries** — SQL queries for sync health, data freshness, deep link coverage per service

### Phase 5: App Layer Migration (B1.5)

**5a. Create Supabase content query module** — `src/lib/api/supabaseContent.ts`

```typescript
// Key exports:
interface StreamingLink {
  serviceId: ServiceId;
  streamType: 'subscription' | 'rent' | 'buy' | 'free' | 'addon';
  deepLinkUrl: string;
  videoLinkUrl?: string;
  quality?: string;
  priceFormatted?: string;
  expiresSoon?: boolean;
}

function getStreamingLinks(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<StreamingLink[]>
function fetchTitleDetail(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<{title, streamingLinks}>
function fetchPopularTitles(serviceIds: string[], limit: number): Promise<ContentItem[]>
```

**5b. Extend DetailData interface** — `src/lib/adapters/detailAdapter.ts`
- Add `serviceLinks: Record<string, { url: string; type: 'exact' | 'search' }>` to `DetailData`
- Change `buildDetailData` signature: replace `watchModePrices?: any` with `streamingLinks?: StreamingLink[]`
- Streaming links populate `allServices` (subscription/free types) AND store deep link URLs in `serviceLinks`
- Rent/buy from `streamingLinks` replace WatchMode pricing, with TMDb rent/buy as fallback
- `resolveServiceKey` gains an SA API service ID path alongside the existing name/provider-ID paths

**5c. Update useContentDetail.ts**
- Replace `import { getTitlePrices } from '@/lib/api/watchmode'` with `import { getStreamingLinks } from '@/lib/api/supabaseContent'`
- Replace WatchMode call in `Promise.allSettled`:
  ```
  // OLD: getTitlePrices(tmdbId, mediaType)
  // NEW: getStreamingLinks(tmdbId, mediaType)
  ```
- Pass `streamingLinks` to `buildDetailData` instead of `prices`
- **Fallback**: If Supabase returns empty, TMDb `watch/providers` (already fetched via `append_to_response`) still provides service detection. Deep links just won't be available (pills display without tap handler).

**5d. Keep TMDb for**: discover/search, similar/recommendations, trailers, networks fallback for new TV

### Phase 6: Deep Linking (DL.1–DL.5)

**6a. Install `@capacitor/browser`**
```bash
npm install @capacitor/browser
npx cap sync android
```

**6b. Create deep link utility** — `src/lib/deepLinks.ts`
- `getDeepLink(serviceId, saLink, title)` → returns SA API link if available, else search URL fallback
- Search URL fallbacks for all 10 UK services (Netflix search, Prime search, etc.)
- Returns `{ url, type: 'exact' | 'search' }`

**6c. Create link opener** — `src/lib/openDeepLink.ts`
- `openDeepLink(url)` — uses `Browser.open({ url })` on native (triggers OS App Links routing), `window.open` on web
- Android handles HTTPS universal links automatically — if streaming app is installed and has verified the domain, it opens in-app; otherwise falls through to browser

**6d. Add tap handlers to DetailPage.tsx** — `WhereToWatch` component

Changes to `WhereToWatch`:
- Accept `serviceLinks` and `title` from `detail`
- **Tier 1 pills**: Wrap existing `<span>` in `<button>`, add `onClick` → `openDeepLink(getDeepLink(...))`
- **Tier 2 pills**: Same treatment
- **Tier 3 rent/buy rows**: Same, each row becomes tappable
- Add `ExternalLink` icon (lucide-react, already installed) — small (w-3 h-3), muted, at right edge of each pill
- Press animation: `active:scale-[0.97] transition-transform`

**6e. Attribution** — `src/components/ProfilePage.tsx`
- Add data source attribution section: SA API by Movie of the Night, TMDb, JustWatch

### Phase 7: Data Quality (E1.1)

**7a. Add `tmdb_confirmed` column** to `streaming_availability`
- During sync, after SA API upsert, cross-reference with TMDb `watch/providers`
- Set `tmdb_confirmed = TRUE` where both sources agree

**7b. Discrepancy reporting queries**
- Titles where SA API has data but TMDb doesn't (or vice versa)
- Correlation with user availability reports (existing P4 epic)

---

## Files Summary

### Create
| File | Purpose |
|---|---|
| `src/lib/api/streamingAvailability.ts` | SA API client (axios + cache pattern) |
| `src/lib/api/supabaseContent.ts` | Supabase content queries for app layer |
| `src/lib/deepLinks.ts` | Deep link resolution (SA link → search fallback) |
| `src/lib/openDeepLink.ts` | Capacitor Browser.open / web window.open |
| `src/lib/api/testSaApi.ts` | SA API validation script (dev only) |
| `supabase/migrations/001_content_tables.sql` | Schema: titles, streaming_availability, genres, credits, sync_log |
| `supabase/functions/sync-content/index.ts` | Full sync Edge Function (Deno) |
| `supabase/functions/sync-incremental/index.ts` | Daily incremental sync Edge Function |

### Modify
| File | Changes |
|---|---|
| `src/lib/adapters/platformAdapter.ts` | Add SA API service ID mapping |
| `src/lib/adapters/detailAdapter.ts` | Replace `watchModePrices` with `streamingLinks`, add `serviceLinks` to `DetailData` |
| `src/hooks/useContentDetail.ts` | Replace WatchMode → Supabase streaming links |
| `src/components/DetailPage.tsx` | Add tap handlers + ExternalLink icon to WhereToWatch pills |
| `src/components/ProfilePage.tsx` | Add SA API attribution |
| `src/lib/api/cache.ts` | Replace WATCHMODE prefix/TTL → SA |
| `src/lib/storage.ts` | Replace `watchmode_` → `sa_` in quota filter |
| `src/lib/constants/config.ts` | Replace `WATCHMODE_TTL_HOURS` → `SA_TTL_HOURS` |
| `src/vite-env.d.ts` | Swap API key type |
| `.env.example` | Swap API key |
| `README.md` | Update API section |
| `docs/Attributions.md` | SA API + TMDb + JustWatch attribution |

### Delete
| File | Reason |
|---|---|
| `src/lib/api/watchmode.ts` | Fully replaced by SA API |

---

## Verification

After each phase, verify:

1. **Phase 1**: `npm run build` succeeds with zero WatchMode references. SA API test script returns deep links for all 10 UK services.
2. **Phase 2**: Tables created in Supabase Dashboard → Table Editor. RLS policies verified (anon can SELECT, cannot INSERT).
3. **Phase 3**: Run full sync. Check `sync_log` for completion. Spot-check 5 popular titles in `streaming_availability` — deep links present.
4. **Phase 4**: Trigger incremental sync manually. Verify only changed titles updated. Check monitoring queries return data.
5. **Phase 5**: Open Detail Page for a title with Supabase data. Verify services display correctly. Check `serviceLinks` populated in React DevTools.
6. **Phase 6**: Install APK on phone. Tap Netflix pill for a title on Netflix → Netflix app opens to that title. Tap pill for uninstalled app → browser opens to service website. Test all 10 services per DL.4 checklist.
7. **Phase 7**: Run discrepancy query. Review results for obvious data quality issues.

### End-to-end smoke test
1. Open Videx → search "Stranger Things" → tap result → Detail Page loads
2. "Where to Watch" shows Netflix (Tier 1 if connected) with ExternalLink icon
3. Tap Netflix pill → Netflix app opens to Stranger Things
4. Rent/Buy section shows prices from SA API (e.g. "Buy from £7.99")
5. Tap rent/buy row → service app/website opens
