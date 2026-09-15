---
title: Add-on channel entitlements
type: concept
tags: [product, services, channels, availability, entitlements, in-sc-004]
created: 2026-09-15
updated: 2026-09-15
sources:
  - docs/strategy/briefs/addon-entitlements.md
  - supabase/migrations/086_addon_channel_entitlements.sql
related:
  - wiki/concepts/operations/sync-pipeline.md
  - wiki/entities/codebase/migrations.md
  - wiki/registers/parking-lot.md
---

# Add-on channel entitlements

Prime Video, Apple TV and NOW sell other services inside themselves: Prime Video Channels (~85 in the UK), Apple TV Channels (~50), NOW's passes. The vendor tags such a streaming option `stream_type = 'addon'` with `addon_id` / `addon_name`. Holding the parent does not mean holding the channel, so a channel row is "on your services" only for users who hold that channel. Built, live and device-verified 2026-09-15 (IN-SC-004, PR #176); replaces the 084/085 interim in which a channel-only title was on nobody's services.

## The rules

| Rule | Consequence |
|---|---|
| One entitlement per channel, however it is bought | HBO Max direct = HBO Max via Prime; Hayu via Prime = Hayu via a NOW pass |
| A channel that is also a standalone Videx service **is** that service | `hbo`, `paramount`, `discovery`, `crunchyroll`, `mubi` are held through `user_services`; the chip under Prime and the tile toggle the same id. Holding the service counts its channel rows on every parent |
| Any other channel counts on a parent only when the user holds that parent | Shudder held + Apple only → Prime's Shudder rows do not count |
| The picker is curated | Only `service_addons.curated` rows are offered. The tail (Simply South, Eros Now, Dekkoo …) stays visible in where-to-watch as "Via a channel" and is never an entitlement |
| NOW is not special-cased | Three chips (Cinema, Entertainment, Hayu) under the NOW tile, exactly like Prime and Apple |
| No stored route preference | A user holding HBO Max sees the HBO Max tile route and the Prime-channel route side by side; the deep-link ladder is unchanged |

## Data (migration 086)

| Object | Shape | Notes |
|---|---|---|
| `service_addons` | PK `(parent_service_id, addon_id)` → `channel_id`, `display_name`, `standalone_service_id`, `curated`, `sort` | Public read. Many vendor ids map to one channel: Apple's Paramount+ ×3, Crunchyroll ×2, Prime's HBO Max ×2. `standalone_service_id`, when set, must equal `channel_id` |
| `user_service_addons` | PK `(user_id, channel_id)` | Non-standalone channels only. Own-row RLS; in `delete_own_account()` and `export_user_data()` (v1.2) |
| `set_own_service_addons(text[])` | atomic replace, returns kept ids | Drops unknown, uncurated and standalone ids server-side |
| `titles.channel_services` | `text[]`, GIN | One `<service_id>:<addon_id>` token per addon row. Written by the same trigger/recompute as `available_services`; `count_available_services_drift()` covers both arrays. Raw vendor ids, so a registry edit needs no titles refresh |

## The filter

A user's tokens come from expanding the registry against their services + channels (`src/lib/entitlements/channels.ts`, `channelTokensFor`). Every availability check is then

```
available_services && <services>  OR  channel_services && <tokens>
```

- **For You**: `get_available_tmdb_ids(service_ids, channel_tokens)`. Before 086 this RPC read every `streaming_availability` row, rent/buy/addon included — 085 never reached For You. Now it reads the two title arrays: 71,798 → 18,166 ids for a typical user (all 11 users shift once when 086 applies).
- **Home**: PostgREST `.or('available_services.ov.{…},channel_services.ov.{"prime:shuddertv"}')` in genre spotlights, trending intersection and the gated acclaimed row. Elements are double-quoted (tokens contain `:` and `.`); verified against live PostgREST 2026-09-15.
- Callers send tokens only when there are any, so a user without channels makes exactly the pre-086 call.

Measured 2026-09-15 on a copy of `titles`: 20 ms BitmapOr over both GIN indexes, against 178 ms for the old RPC and 615 ms for a query-time join on `streaming_availability`.

## Surfaces

| Surface | Behaviour |
|---|---|
| Worker `/v1/foryou`, `/v1/home` | Optional `channels=a,b` (≤ 30, `^[a-z0-9_]{1,40}$`; malformed dropped, oversized → 400). Checked against the registry (isolate cache 10 min; read failure → no channels), unknown ids dropped rather than rejected so a registry addition never breaks an older Worker. Channels join the feed/home KV keys as a hash, only when present; the availids key is `v2` |
| Onboarding step 2, Profile → Streaming Services | Shared `ServicePicker`: tiles, and chips beneath the row of a selected tile that has curated channels. Onboarding saves channels in the same all-or-nothing completion; Profile never overwrites channels it could not read |
| Detail → Where to Watch | Held channels join tier 1 ("Watch on Shudder · via Prime Video", standalone badge when the channel is a service); the rest stay in "Via a channel". `StreamingLink.channelToken`; links cache key bumped to `links2_` |
| Search hits, `subscription_included_titles` | Unchanged — held channels do not yet count as included there |
| Share page, fingerprints | Unchanged — addon rows skipped / excluded |
| Relevance floor (`backfill-missing-titles`) | Curated channel rows count as included (20 votes); the tail stays at 200. Needs 086 applied before the function is deployed |
| Web (`src/components`) | Not wired; defaults keep it on included-only |

## Curating a channel

Insert rows into `service_addons` — no release. A new `channel_id` is picked up by the app on its next registry fetch and by the Worker within 10 minutes. The unmapped-tail query lives in the [sync pipeline runbook](../operations/sync-pipeline.md#addon-tier-rows-prime-video-channels-apple-tv-channels-now-passes).

## Known limitations

- **One addon row per (title, service, quality).** `idx_sa_unique_entry` does not include `addon_id`, and `sync-content.ts` dedupes on `service_id-stream_type-quality`, so a title sold through two channels on one parent keeps only one of them. A holder of the dropped channel does not see the title. IN-SC-005.
- Standalone services count their channel rows without the parent (a user with HBO Max direct gets the few titles the vendor lists only under Prime's HBO Max channel) — deliberate.
- Held channels are not yet "included" for search hits or the semantic search cost filter.
- The first picker's chip panel spanned both grid columns and opened by default, so it was unclear which tile it belonged to (IN-SC-006). Replaced by Direction B (`docs/design/service-picker-direction-b.md`): a strip inside the selected parent tile that opens a per-parent sheet, plus "I have this" on Where to Watch (adds the channel — or the service, when the channel is one — with Undo).
- The `user_service_addons` RLS policy should use `(select auth.uid())` (IN-SC-007).

## Decisions (Joe, 2026-09-15)

Second array on `titles` maintained by the existing trigger (respects the two-writers rule — that rule is about creating title rows); fix For You in 086 with the RPC's JSON-array shape unchanged; apply in the evening and let the 04:00 UTC recompute pick it up; NOW passes included as ordinary chips; curated channels get the 20-vote floor, skip-row delete approved in principle pending the exact count.
