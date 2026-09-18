---
title: videx-api Worker — public routes and cache TTLs
type: entity
tags: [codebase, workers, cloudflare, growth, deep-links, caching]
created: 2026-09-18
updated: 2026-09-18
sources:
  - workers/api/src/index.ts, pageShell.ts, listPage.ts, listStore.ts (repo)
  - workers/api/README.md (repo)
  - docs/plans/2026-09-18-004-handoff-growth-h3-list-links.md (repo)
related:
  - wiki/concepts/decisions/adr-015-object-urls-and-inbound-links.md
  - wiki/concepts/techniques/inbound-deep-linking.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/concepts/architecture/platform-architecture.md
---

# videx-api Worker: public routes and cache TTLs

The Cloudflare Worker in `workers/api/` (Hono). This page covers the **public object URLs** and their edge-cache rules; the engine routes (`/v1/foryou`, `/v1/home`, the TMDb proxy) are in [Platform architecture](../../concepts/architecture/platform-architecture.md). Every public prefix needs a Cloudflare dashboard route to `videx-api` (`/t/*`, `/room/*`, `/list/*` are live). Deploys from `main` via CI.

## Object pages and JSON

| Route | Reads | Edge TTL | Cache key | Notes |
|---|---|---|---|---|
| `GET /t/:type/:ref` | `titles` + availability | 24h (`PAGE_TTL_SECONDS`) | `titlePageCacheKey` (type, id, bucket) | Stale or missing slug 301s to canonical. |
| `GET /room/:id` | `loadSharedRoom` (088) | 24h | `roomPageCacheKey` (id, bucket) | Frozen snapshot. |
| `GET /v1/room/:id` | `loadSharedRoom` | 1h | `/v1/room/{id}` | JSON for the app. |
| `GET /list/:id` | `loadListPreview` (093) | **60 s** (`LIST_PAGE_TTL_SECONDS`) | `listPageCacheKey` (id, bucket) | G2 H3. Live list; noindex; non-uuid or unknown id → branded 404. |
| `GET /v1/list/:id/preview` | `loadListPreview` | 60 s | `/v1/list/{id}/preview` | G2 H3. `{id, name, household_name, count, posters, members}`; 404 JSON when unknown. Public; H2's signed-out list screen reads it. |

Members read the full list in the app under RLS; the plan's JWT member route `GET /v1/list/:id` was dropped after H1 (plan §11b).

## Cache rules

- Keys hold path + platform bucket (`android`/`ios`/`other`) + `PAGE_CACHE_VERSION` (`v4` since G2 H3, 2026-09-18), never the query. Bump the version with any page markup change.
- `?via=`, `?src=` and, on list pages, `?invite=` are filled into two markers after the cache read (`applyAttribution` in `pageShell.ts`): the `videx://` deep link and the Play link's `referrer=` (`t=` title, `r=` room, `l=` list + `i=` invite; `src/lib/growth/installReferrer.ts`). The invite never enters a key or a cached body.
- `withEdgeCache` stores only `ok` responses; branded 404s carry `public, max-age=300` and are not stored by the Worker.
- Browser `max-age=60` on every cached response (`cacheControlFor`).

## Privacy boundary of the list preview

`loadListPreview` (service role) selects `watchlists (id, name, household_id)`, `households (name)`, a head-only count of `watchlist_items`, up to 12 `poster_path` values newest first (plain TMDb paths only, 6 shown), and a head-only count of `household_members`. It never selects usernames, `added_by`, user ids or `household_invites`; `listStore.test.ts` pins the column lists and `listPage.test.ts` renders with decoy names, emails and tokens.

## Telemetry

Every page 200 records `preview_fetched` (crawler) or `preview_opened` (person) through `recordPreview`, cache hits included; list pages use object `{type: 'list', id}`. See [Event Taxonomy](event-taxonomy.md).
