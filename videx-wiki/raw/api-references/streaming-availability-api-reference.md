---
title: Streaming Availability API Reference
generated: 2026-04-26
source: https://docs.movieofthenight.com/
client: src/lib/api/streamingAvailability.ts
---

# Streaming Availability API Reference (Videx slice)

Movie of the Night's API powers JustWatch-derived deep links, rent/buy pricing, and quality info. Videx uses it server-side only; data is cached into Supabase and read by the client from there.

## Auth

- Distributed via RapidAPI. Header-based:
  ```
  X-RapidAPI-Key: ${SA_API_KEY}
  X-RapidAPI-Host: streaming-availability.p.rapidapi.com
  ```
- `SA_API_KEY` is **server-side only**. No `VITE_` prefix. Sync scripts and Edge Functions use it; the bundled client never sees it.

## Base URL

```
https://streaming-availability.p.rapidapi.com
```

## Endpoints used by Videx

### `GET /shows/{id}` and `GET /shows/movie/{tmdb_id}`, `GET /shows/series/{tmdb_id}`

Single-title lookup. Returns availability per service per country, with deep links and pricing.

Key response fields:
- `streamingOptions.gb[]` — array of options. Each has `service.id` (slug like `netflix`, `prime`, `iplayer`), `link` (deep URL), `type` (`subscription` | `buy` | `rent` | `addon` | `free`), `quality`, `price`, `expiresOn`, `availableSince`.

### `GET /shows/search/filters`

Catalogue search by service / country / type. Used by the wire-format spike and historic backfill.

Key params: `country=gb`, `catalogs=<slug>`, `show_type=movie|series`, `cursor` for pagination.

### `GET /changes`

Daily delta endpoint. Returns titles added or removed since `change_type=updated&change_period=lasthours&hours=24` style filters. Powers `sync-incremental` Edge Function (06:00 UTC daily). Writes deltas to `streaming_history` for an audit trail.

### `GET /countries/{country}` (`GET /countries/gb`)

Returns the list of services SA API supports for a country. Response uses array indices with service objects under `services`. Iterate via `Object.values(countriesData.services)` to get the full list.

## Service slugs

```
netflix, prime, disney, apple, paramount, now, all4, itvx,
iplayer (catalogue empty - see gaps), 
```

`hbo`, `hulu`, etc. exist for other regions but are not relevant for GB.

## Coverage gaps (UK)

- **BBC iPlayer (`iplayer`):** listed in `/countries/gb` but `/shows/search/filters?catalogs=iplayer` returns `{ shows: [], hasMore: false }`. The service is registered with no catalogue data populated. Filed upstream issue with Movie of the Night. See `docs/solutions/integration-issues/sa-api-uk-service-coverage-gaps.md`.
- **Sky Go:** not present in the SA API at any tier. Videx falls back to `sky.com/watch/search?term=…`.
- All other UK services have catalogue coverage to varying depths. Channel 4 / All 4 use slug `all4`.

## Pricing tier

Videx is on a paid RapidAPI tier sufficient for daily incremental sync plus on-demand backfills. Higher tiers do not unlock additional UK service coverage; the iPlayer / Sky Go gap is a data issue, not a tier issue.

## Quirks

- `service.id` and the slug Videx uses internally diverge for some services (`now` ↔ Now TV, `all4` ↔ Channel 4). The mapping lives in `lib/adapters/platformAdapter.ts`.
- `streamingOptions.gb[]` may contain multiple entries per service (subscription + addon + rent + buy). Sync writes one row per `(tmdb_id, media_type, service_id, type, quality)` tuple.
- `link` may be a web URL or an app-scheme URL depending on the service. Confidence is tagged at click time by `openDeepLink.ts`.
- `expiresOn` is set for some services (NOW especially); used to power "leaving soon" alerts.

## Rate limits

Tier-dependent. Sync respects `Retry-After` headers and back-off via `cache.ts`. Bulk sync (`--stage sa`) iterates by TMDb ID list with concurrency = 4.
