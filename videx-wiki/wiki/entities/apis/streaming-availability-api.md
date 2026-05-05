---
title: Streaming Availability API (Movie of the Night)
type: entity
tags: [api, sa-api, deep-links, rapidapi, justwatch]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/api-references/streaming-availability-api-reference.md
related:
  - wiki/entities/apis/tmdb.md
  - wiki/entities/infrastructure/rapidapi.md
  - wiki/entities/streaming-services/uk-services.md
  - wiki/concepts/decisions/adr-001-watchmode-replaced-by-sa-api.md
  - wiki/concepts/operations/solutions/sa-api-uk-service-coverage-gaps.md
---

# Streaming Availability API (Movie of the Night)

JustWatch-derived deep links, rent/buy pricing, quality info. Server-side only; data cached in Supabase, client reads from cache.

## Auth

Header-based via RapidAPI:

```
X-RapidAPI-Key: ${SA_API_KEY}
X-RapidAPI-Host: streaming-availability.p.rapidapi.com
```

`SA_API_KEY` is **server-side only** (no `VITE_` prefix). Sync scripts and Edge Functions use it.

## Base URL

`https://streaming-availability.p.rapidapi.com`

## Endpoints used

| Endpoint | Purpose |
|---|---|
| `GET /shows/{id}`, `GET /shows/movie/{tmdb_id}`, `GET /shows/series/{tmdb_id}` | Single-title lookup. Returns availability per service per country, deep links, pricing. |
| `GET /shows/search/filters` | Catalogue search by service/country/type. Used by wire-format spike and historic backfill. |
| `GET /changes` | Daily delta endpoint. Powers `sync-incremental` (06:00 UTC). Writes to `streaming_history` for audit trail. |
| `GET /countries/{country}` | Service list for a country. Iterate `Object.values(countriesData.services)`. |

## Response shape

`streamingOptions.gb[]` array, each with `service.id` (slug), `link` (deep URL), `type` (`subscription`/`buy`/`rent`/`addon`/`free`), `quality`, `price`, `expiresOn`, `availableSince`.

## Service slugs

`netflix`, `prime`, `disney`, `apple`, `paramount`, `now`, `all4`, `itvx`, `iplayer` (catalogue empty). `sky go` not in API.

## Coverage gaps (UK)

- **BBC iPlayer (`iplayer`)**: listed in `/countries/gb` but `/shows/search/filters?catalogs=iplayer` returns `{ shows: [], hasMore: false }`. Service registered with no catalogue data populated. Filed upstream issue. Phase 2.5 addresses via TMDb watch/providers backfill.
- **Sky Go**: not present at any tier. Falls back to `sky.com/watch/search?term=…`.

Higher RapidAPI tiers do not unlock additional UK service coverage.

## Quirks

- `service.id` and Videx slug diverge for some services (`now` ↔ NOW, `all4` ↔ Channel 4). Mapping in `lib/adapters/platformAdapter.ts`.
- `streamingOptions.gb[]` may contain multiple entries per service (subscription + addon + rent + buy). Sync writes one row per `(tmdb_id, media_type, service_id, type, quality)`.
- `link` may be web URL or app-scheme depending on service. Confidence tagged at click time by `openDeepLink.ts`.
- `expiresOn` set for some services (NOW especially); used for "leaving soon".

## Rate limits

Tier-dependent. Sync respects `Retry-After` headers. Bulk sync iterates by TMDb ID list with concurrency = 4.
