---
title: Source — API references (TMDb, OMDB, SA API)
type: source
tags: [api-references, tmdb, omdb, sa-api]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/api-references/tmdb-api-reference.md
  - raw/api-references/omdb-api-reference.md
  - raw/api-references/streaming-availability-api-reference.md
related:
  - wiki/entities/apis/tmdb.md
  - wiki/entities/apis/omdb.md
  - wiki/entities/apis/streaming-availability-api.md
---

# Source: API references

Three reference docs under `raw/api-references/`. Each maps to a wiki entity page under `wiki/entities/apis/`.

| Raw | Wiki entity |
|---|---|
| `tmdb-api-reference.md` | [TMDb](../entities/apis/tmdb.md) |
| `omdb-api-reference.md` | [OMDB](../entities/apis/omdb.md) |
| `streaming-availability-api-reference.md` | [Streaming Availability API](../entities/apis/streaming-availability-api.md) |

## Why it matters

Pins endpoint contracts and quirks (TMDb sentinel zeros, BBC iPlayer empty SA catalogue, OMDB IMDb-ID-preferred lookup, deep-link confidence tagging). Re-ingest if any third-party API changes.
