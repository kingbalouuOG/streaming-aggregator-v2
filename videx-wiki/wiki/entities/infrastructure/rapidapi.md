---
title: RapidAPI
type: entity
tags: [rapidapi, sa-api, marketplace]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/infrastructure/rapidapi.md
related:
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/concepts/operations/service-role-jwt-rotation.md
---

# RapidAPI

Marketplace and proxy for the Streaming Availability API. Videx uses RapidAPI only for SA API; TMDb and OMDB are direct.

## Auth

Header-based on every SA API request:

```
X-RapidAPI-Key: ${SA_API_KEY}
X-RapidAPI-Host: streaming-availability.p.rapidapi.com
```

Key is **server-side only**. Storage:

- `.env` (`SA_API_KEY`, no `VITE_` prefix).
- Supabase Edge Function secrets.
- GitHub Actions secrets for the monthly recluster job (kept centralised).

## Tier

Paid tier sufficient for ~20K-row initial bulk sync, daily incremental sync via `/changes`, ad-hoc enrichment runs.

Higher tiers do not unlock additional UK service coverage; the BBC iPlayer / Sky Go gap is a data-population issue, not a billing tier issue.

## Quota and headers

- `X-RateLimit-Requests-Limit`, `X-RateLimit-Requests-Remaining`, `X-RateLimit-Requests-Reset` returned on every response.
- Sync respects `Retry-After` on 429.
- Concurrency cap = 4 (set in `scripts/sync-content.ts`).

## Billing safeguards

- Quota alarm in RapidAPI dashboard at 80% of monthly cap.
- No client-bundled key, so no risk of runaway calls from a misbehaving client.

## Failure modes

| Status | Cause | Action |
|---|---|---|
| 401 | key missing or revoked | Sync fails fast |
| 403 | key not subscribed to SA API endpoint | Re-subscribe in dashboard |
| 429 | rate-limited | Back off via `cache.ts` retry helper |
| 5xx | transient | Same back-off path |
