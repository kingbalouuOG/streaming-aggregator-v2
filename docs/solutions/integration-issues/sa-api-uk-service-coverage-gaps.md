---
title: "SA API UK Service Coverage: BBC iPlayer Empty, Sky Go Absent"
category: integration-issues
date: 2026-03-16
tags: [streaming-availability-api, sa-api, bbc-iplayer, sky-go, uk-services, deep-links, coverage-gap]
services_affected: [bbc, skygo]
api: streaming-availability
---

## Problem

The Streaming Availability API (Movie of the Night) lists BBC iPlayer (`iplayer`) as a supported UK service in its `/countries/gb` endpoint and documentation, but returns zero titles when querying `catalogs=iplayer`. Sky Go is not listed in the API at all.

This was discovered during Phase 1 validation (B1.0) when testing deep link coverage for all 10 UK streaming services.

## Investigation Steps

1. **Initial test**: `runSaApiTests()` with known BBC/Sky titles (Peaky Blinders, Game of Thrones, Doctor Who) — no `iplayer` or `sky` service IDs in any response.
2. **`/countries/gb` endpoint check**: Returned 15 services as an array. `iplayer` and `itvx` strings found in response body, but NOT in the top-level service list initially (parsing issue — services returned as array indices, not slug-keyed object).
3. **Correct parsing**: Iterating `Object.values(countriesData.services)` revealed the correct service objects with `.id` and `.name` fields. BBC iPlayer (`iplayer`) IS listed.
4. **Catalogue search**: `GET /shows/search/filters?country=gb&catalogs=iplayer` → `{"shows":[],"hasMore":false}`. Zero titles.
5. **Comparison test**: Same query for `itvx`, `all4`, `paramount`, `now` — all returned 20+ titles. Only `iplayer` returned empty.
6. **Documentation review**: Official docs and RapidAPI listing explicitly mention BBC iPlayer. No notes about empty catalogues or data gaps. GitHub repo has 0 open issues.
7. **Pricing tier check**: All tiers have the same service coverage. Paying does not unlock more catalogue data.

## Root Cause

BBC iPlayer is **technically integrated** in the SA API's service registry but has **no catalogue data populated**. This is likely because BBC is a public broadcaster with non-commercial content — their data may be harder to source compared to commercial services with JustWatch integrations. Sky Go is simply not integrated at all.

A GitHub issue was filed: `movieofthenight/streaming-availability-api` — asking about iPlayer catalogue status.

## Working Solution: Hybrid Architecture

```
Service Detection:  TMDb watch/providers (all 10 UK services)
Deep Links (8):     SA API via Supabase (netflix, prime, disney, apple, itvx, paramount, now, all4)
Deep Links (2):     Search URL fallbacks (bbc → bbc.co.uk/iplayer/search, skygo → sky.com/watch/search)
```

**Key implementation details:**

1. TMDb `watch/providers` remains the primary source for *which* services a title is on (covers all 10 including BBC/Sky).
2. SA API data (via Supabase `streaming_availability` table) provides exact deep link URLs for the 8 covered services.
3. `src/lib/deepLinks.ts` has `SEARCH_FALLBACKS` for all 10 services — when no SA API link exists, it falls back to the service's search page.
4. The `iplayer: 'bbc'` mapping is kept in `platformAdapter.ts` for future-proofing (with comment noting empty catalogue as of March 2026).

```typescript
// src/lib/deepLinks.ts — fallback chain
export function getDeepLink(serviceId, saLink, title): DeepLinkResult {
  if (saLink) return { url: saLink, type: 'exact' };        // SA API exact link
  const fallback = SEARCH_FALLBACKS[serviceId];
  if (fallback) return { url: fallback(title), type: 'search' }; // Search URL
  return { url: googleSearch(title), type: 'search' };       // Last resort
}
```

## Confirmed SA API UK Service Slugs

```
netflix   → netflix      all4       → channel4
prime     → prime        iplayer    → bbc (EMPTY catalogue)
disney    → disney       paramount  → paramount
apple     → apple        now        → now
itvx      → itvx
```

Sky Go: Not in SA API at all.

## Prevention / Future Considerations

- **Monitor the GitHub issue** — if SA API populates BBC iPlayer data, deep links will work automatically (the mapping and fallback chain already handle it).
- **When validating new API integrations**, always test actual data availability per-service, not just the service registry/listing.
- **The `/countries/{code}` endpoint** lists "supported" services, but "supported" does not guarantee populated catalogue data.
- BBC iPlayer and Sky Go are free/included services — no rent/buy pricing is needed, so the coverage gap only affects deep link precision (search fallback is functional).
