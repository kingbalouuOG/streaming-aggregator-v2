---
title: RapidAPI
generated: 2026-04-26
---

# RapidAPI

Marketplace and proxy for the Streaming Availability API. Videx interacts with RapidAPI only for SA API; TMDb and OMDB are used directly.

## Auth

Header-based on every SA API request:

```
X-RapidAPI-Key: ${SA_API_KEY}
X-RapidAPI-Host: streaming-availability.p.rapidapi.com
```

Key is server-side only. Storage: `.env` (`SA_API_KEY`, no `VITE_` prefix), Supabase Edge Function secrets, GitHub Actions secrets for the monthly recluster job (which does not need it directly but kept centralised).

## Tier

Paid tier sufficient for:
- ~20K-row initial bulk sync (one-off; takes hours).
- Daily incremental sync via `/changes` endpoint (low call volume).
- Ad-hoc enrichment runs.

Higher tiers do not unlock additional UK service coverage; the iPlayer / Sky Go gap is a data-population issue, not a billing tier issue.

## Quota and headers

- `X-RateLimit-Requests-Limit`, `X-RateLimit-Requests-Remaining`, `X-RateLimit-Requests-Reset` returned on every response.
- Sync respects `Retry-After` header on 429 responses.
- Concurrency cap = 4 by convention (set in `scripts/sync-content.ts`).

## Billing safeguards

- Quota alarm configured in RapidAPI dashboard at 80% of monthly cap.
- No client-bundled key, so no risk of runaway calls from a misbehaving client.

## Failure modes

- **401:** key missing or revoked. Sync fails fast.
- **403:** key not subscribed to SA API endpoint. Re-subscribe in dashboard.
- **429:** rate-limited. Sync backs off via `cache.ts` retry helper.
- **5xx:** transient. Same back-off path.
