---
title: JustWatch as upstream source
type: concept
tags: [justwatch, domain, upstream, attribution]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/concepts/justwatch-as-source.md
related:
  - wiki/entities/apis/tmdb.md
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/concepts/operations/solutions/sa-api-uk-service-coverage-gaps.md
---

# JustWatch as upstream source

JustWatch is the dominant aggregator of streaming availability data. Most third-party APIs that surface "what's on Netflix in the UK" are downstream of JustWatch.

## Transitive dependence

| API Videx uses | JustWatch dependence |
|---|---|
| TMDb `watch/providers` | JustWatch licenses provider data to TMDb. TMDb's `watch/providers` block carries a "Source: JustWatch" attribution requirement. |
| Streaming Availability API | Sources catalogue and deep links from JustWatch. The catalogue gaps Videx hits (BBC iPlayer empty, Sky Go absent) reflect JustWatch coverage decisions, not SA API failures. |

## Implications

- **Coverage gaps are upstream.** Filing issues against TMDb or SA API for missing iPlayer data is unlikely to resolve them; the gap is at JustWatch's data ingestion.
- **Lag is upstream.** New titles take days-weeks to appear in `watch/providers` because the JustWatch crawl propagates through TMDb. Network-name fallback (`platforms.ts NETWORK_TO_PROVIDER_ID`) mitigates partly.
- **Attribution required.** TMDb requires "Source: JustWatch" displayed near any UI that uses `watch/providers` data.

## Public-broadcaster blind spot

JustWatch's coverage of BBC iPlayer is poor. Likely reasons (informed speculation):

- BBC is publicly funded; no commercial incentive to provide structured catalogue feeds to JustWatch.
- iPlayer rotates content frequently and uses non-standard identifiers.
- BBC has historically been wary of third-party indexing.

Less severe but similar effects on Channel 4 (now better covered) and ITVX. Phase 2.5 backfilled BBC/NOW/SkyGo via TMDb watch/providers (200 titles each).

## Direct alternatives if gaps become critical

- JustWatch Pro/Partner API: direct access. Higher cost, same coverage.
- BBC Programmes / iPlayer scraping: technically possible, terms of service prohibitive.
- Manual curation: small team maintaining a UK public-broadcaster catalogue. Operationally expensive.

For now, search-URL fallback (`bbc.co.uk/iplayer/search?q={title}`, `sky.com/watch/search?term={title}`) keeps the user one tap from the title.
