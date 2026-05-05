---
title: JustWatch as Upstream Data Source
generated: 2026-04-26
---

# JustWatch as Upstream Source

JustWatch is the dominant aggregator of streaming availability data. Most third-party APIs that surface "what's on Netflix in the UK" are downstream of JustWatch.

## How Videx depends on JustWatch (transitively)

| API Videx uses | JustWatch dependence |
|---|---|
| TMDb `watch/providers` | JustWatch licenses provider data to TMDb. TMDb's `watch/providers` block carries a "Source: JustWatch" attribution requirement. |
| Streaming Availability API (Movie of the Night) | Sources catalogue and deep links from JustWatch. The catalogue gaps Videx hits (BBC iPlayer empty, Sky Go absent) reflect JustWatch coverage decisions, not SA API failures. |

## Implications

- **Coverage gaps are upstream.** Filing issues against TMDb or SA API for missing iPlayer data is unlikely to resolve them; the gap is at JustWatch's data ingestion.
- **Lag is upstream too.** New titles take days to weeks to appear in `watch/providers` because the JustWatch crawl propagates through TMDb. Network-name fallback (`platforms.ts NETWORK_TO_PROVIDER_ID`) mitigates partly.
- **Attribution.** TMDb requires "Source: JustWatch" displayed near any UI that uses watch/providers data. Videx does this implicitly by showing the JustWatch-style provider rows; consider explicit "Source: JustWatch" on the detail availability section per `docs/Attributions.md`.

## Public-broadcaster blind spot

JustWatch's coverage of BBC iPlayer is poor. Likely reasons (informed speculation, not from JustWatch):

- BBC is publicly funded; no commercial incentive to provide structured catalogue feeds to JustWatch.
- iPlayer content rotates frequently and uses non-standard identifiers.
- BBC has historically been wary of third-party indexing.

The same applies to a lesser degree to Channel 4 (which is now better covered) and ITVX.

## Direct alternatives

If iPlayer / Sky Go gaps become commercially critical, options:

- **JustWatch Pro/Partner API:** direct access. Higher cost; same coverage.
- **BBC Programmes / iPlayer scraping:** technically possible, terms of service prohibitive.
- **Manual curation:** small team maintaining a UK public-broadcaster catalogue. Operationally expensive.

For now, search-URL fallback keeps the user one tap from the title; not ideal, not blocking.
