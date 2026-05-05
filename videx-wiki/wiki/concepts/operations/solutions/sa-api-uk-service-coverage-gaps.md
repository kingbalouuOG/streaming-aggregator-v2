---
title: Solution — SA API UK service coverage gaps (BBC iPlayer empty, Sky Go absent)
type: concept
tags: [solution, sa-api, bbc-iplayer, sky-go, coverage-gap]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/solutions/sa-api-uk-service-coverage-gaps.md
related:
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/entities/streaming-services/uk-services.md
  - wiki/concepts/domain/justwatch.md
  - wiki/concepts/operations/phase-2.md
  - wiki/concepts/operations/phase-2-5.md
---

# Solution — SA API UK service coverage gaps

Date: 2026-03-16. Category: integration-issues.

## Problem

The SA API lists BBC iPlayer (`iplayer`) as a supported UK service but returns zero titles for `catalogs=iplayer`. Sky Go is not listed in the API at all.

Discovered during Phase 1 validation when testing deep link coverage for all 10 UK services.

## Investigation

1. `runSaApiTests()` with known BBC/Sky titles (Peaky Blinders, Game of Thrones, Doctor Who) — no `iplayer` or `sky` service IDs in any response.
2. `/countries/gb` returned 15 services as an array. Initial parsing missed `iplayer` because services are returned as array indices, not slug-keyed.
3. `Object.values(countriesData.services)` revealed BBC iPlayer (`iplayer`) IS listed.
4. `GET /shows/search/filters?country=gb&catalogs=iplayer` → `{"shows":[],"hasMore":false}`. Zero titles.
5. Comparison: `itvx`, `all4`, `paramount`, `now` all returned 20+ titles.
6. Documentation review: docs/RapidAPI listing mention BBC iPlayer. No notes about empty catalogues. GitHub repo has 0 open issues.
7. Pricing tier check: all tiers have same service coverage. Paying does not unlock more catalogue data.

## Root cause

BBC iPlayer is **technically integrated** in the SA API's service registry but has **no catalogue data populated**. Likely because BBC is a public broadcaster with non-commercial content; their data is harder to source than commercial services with JustWatch integrations. Sky Go is simply not integrated at all.

GitHub issue filed: `movieofthenight/streaming-availability-api`. No response.

## Working solution: hybrid architecture

```
Service detection:  TMDb watch/providers (all 10 UK services)
Deep links (8):     SA API via Supabase (netflix, prime, disney, apple, itvx, paramount, now, all4)
Deep links (2):     Search URL fallbacks (bbc → bbc.co.uk/iplayer/search, skygo → sky.com/watch/search)
```

Implementation:

1. TMDb `watch/providers` is the primary source for *which* services a title is on (covers all 10).
2. SA API data (via Supabase `streaming_availability`) provides exact deep link URLs for the 8 covered services.
3. `src/lib/deepLinks.ts` has `SEARCH_FALLBACKS` for all 10 services. When no SA API link exists, it falls back to the service's search page.
4. The `iplayer: 'bbc'` mapping is kept in `platformAdapter.ts` for future-proofing.

```typescript
export function getDeepLink(serviceId, saLink, title): DeepLinkResult {
  if (saLink) return { url: saLink, type: 'exact' };
  const fallback = SEARCH_FALLBACKS[serviceId];
  if (fallback) return { url: fallback(title), type: 'search' };
  return { url: googleSearch(title), type: 'search' };
}
```

Phase 2.5 backfilled BBC/NOW/SkyGo via TMDb watch/providers (200 SA rows each, all `subscription`) so service-fingerprint coverage is complete even where SA API is empty.

## Prevention

- Monitor the GitHub issue. If SA API populates BBC iPlayer data, deep links will work automatically (mapping and fallback chain already handle it).
- When validating new API integrations, always test actual data availability per-service, not just the service registry/listing.
- The `/countries/{code}` endpoint lists "supported" services, but "supported" does not guarantee populated catalogue data.
- BBC iPlayer and Sky Go are free/included services — no rent/buy pricing needed, so the gap only affects deep link precision (search fallback is functional).
