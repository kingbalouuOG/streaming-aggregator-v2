---
title: OMDB (Open Movie Database)
type: entity
tags: [api, omdb, ratings, imdb, rotten-tomatoes]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/api-references/omdb-api-reference.md
related:
  - wiki/entities/apis/tmdb.md
  - wiki/entities/codebase/module-map.md
  - wiki/concepts/architecture/home-surface.md
---

# OMDB

Source of IMDb and Rotten Tomatoes ratings. Surfaced on the detail page and the Critically Acclaimed Home row.

## Auth

- Free tier: `VITE_OMDB_API_KEY`. 1,000 req/day.
- Paid (Patron) tier: higher limits.
- Key bundled into client; ratings calls happen client-side from detail page when not pre-cached, and server-side during sync.

## Base URL

`https://www.omdbapi.com/`

## Endpoints

Single endpoint with query-parameter switches.

```
GET /?i=tt1234567&apikey=KEY     # by IMDb ID (preferred)
GET /?t=The+Bear&y=2022&apikey=KEY    # by title (fallback)
```

Videx prefers IMDb-ID lookup because TMDb's `/movie/{id}` and `/tv/{id}` detail returns the IMDb ID, making lookups deterministic.

Parameters used: `i`, `apikey`, `plot=short` (default).

## Response

```json
{
  "imdbRating": "8.6",
  "Ratings": [
    { "Source": "Internet Movie Database", "Value": "8.6/10" },
    { "Source": "Rotten Tomatoes", "Value": "100%" }
  ]
}
```

Parsing in `omdb.ts`:

- IMDb: parse `imdbRating` as float, reject `"N/A"`.
- Rotten Tomatoes: scan `Ratings` for `Source === "Rotten Tomatoes"`, strip `%`, parse integer.
- Metacritic: ignored in v2.
- Errors return `{ Response: "False" }`. Treat as missing data; do not throw.

## Coverage gaps

- TV ratings lag IMDb by hours-days for new episodes.
- Many recent UK-only releases (BBC, ITVX, Channel 4 originals) lack RT scores.
- **Critically Acclaimed Home row gated on OMDB coverage ≥ 80% of titles released in last 90 days.** Phase 4 actuals: 0% RT / 12.3% IMDb on recent releases — row ships disabled behind `CRITICALLY_ACCLAIMED_ROW_ENABLED = false`.

## Rate-limit handling

- `cache.ts` keys OMDB responses by IMDb ID with long TTL (ratings change slowly).
- Sync stage `--stage omdb` checkpoints to `scripts/embeddings/.checkpoint.json` (shared pattern) so quota hit can resume next day.
- Client-side calls only fire on cache miss + key present + on detail page.
