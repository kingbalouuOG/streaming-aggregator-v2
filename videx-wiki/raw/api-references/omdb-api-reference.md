---
title: OMDB API Reference
generated: 2026-04-26
source: http://www.omdbapi.com/
client: src/lib/api/omdb.ts
---

# OMDB API Reference (Videx slice)

OMDB is the source of IMDb and Rotten Tomatoes ratings. Both are surfaced on the detail page and on the Critically Acclaimed home row.

## Auth

- Free tier: `VITE_OMDB_API_KEY`. 1,000 requests / day.
- Paid tier (Patron): higher limits, faster response.
- Key is bundled into the client; ratings calls happen client-side from the detail page when not pre-cached, and server-side during sync.

## Base URL

```
https://www.omdbapi.com/
```

## Endpoints

OMDB exposes a single endpoint with query-parameter switches.

### By IMDb ID (preferred)

```
GET /?i=tt1234567&apikey=KEY
```

Videx uses this form because TMDb returns the IMDb ID on `/movie/{id}` and `/tv/{id}` detail responses, making lookups deterministic.

### By title (fallback)

```
GET /?t=The+Bear&y=2022&apikey=KEY
```

Used only when IMDb ID is missing. Less reliable due to title disambiguation.

### Parameters used

- `i` — IMDb ID.
- `apikey` — required.
- `plot=short` (default) | `plot=full` — Videx uses `short`.
- `tomatoes=true` — historically returned a richer Tomatoes block; current behaviour returns the same `Ratings` array regardless.

## Response shape

```json
{
  "Title": "The Bear",
  "Year": "2022–",
  "imdbRating": "8.6",
  "imdbVotes": "210,123",
  "Ratings": [
    { "Source": "Internet Movie Database", "Value": "8.6/10" },
    { "Source": "Rotten Tomatoes", "Value": "100%" },
    { "Source": "Metacritic", "Value": "86/100" }
  ],
  "Response": "True"
}
```

## Parsing rules in `omdb.ts`

- IMDb: parse `imdbRating` as float; reject if `"N/A"`.
- Rotten Tomatoes: scan `Ratings` for `Source === "Rotten Tomatoes"`; parse value as integer percentage (strip `%`).
- Metacritic: ignored in v2.
- Errors return `{ Response: "False", Error: "..." }`. Treat as missing data; do not throw.

## Coverage gaps

- TV show ratings on OMDB lag IMDb by hours to days for new episodes.
- Many recent UK-only releases (BBC, ITVX, Channel 4 originals) lack RT scores.
- The Critically Acclaimed home row is gated on OMDB coverage reaching 80% of titles released in the last 90 days. See `criticallyAcclaimed.ts` and Composition Hypothesis §2.2.

## Rate-limit handling

- `cache.ts` keys OMDB responses by IMDb ID with a long TTL (ratings change slowly).
- Sync stage `--stage omdb` checkpoints to `scripts/embeddings/.checkpoint.json` (shared pattern) so a quota hit can resume next day.
- Client-side calls only fire when cache miss + key present + on detail page.
