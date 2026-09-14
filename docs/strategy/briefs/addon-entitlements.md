# Add-on channels as sub-entitlements — brief

**Date:** 2026-09-14 · **Status:** brief for a build session; direction agreed with Joe, scope not yet estimated · **Asked by:** Joe · **Depends on:** migration 084 applied (interim: addon rows no longer count toward `available_services`), PR "ingestion floor + addon label" merged.

The question Joe asked: Prime and Apple sell dozens of other services inside themselves — Discovery+, HBO Max, Paramount+, Hayu, Crunchyroll and about eighty more on Prime, fifty on Apple. Do those become separate Videx services, or sub-services that live inside the parent, with a "which of these do you also have?" step? This brief argues for the second, with three refinements, and sets out what changes.

---

## What the data already says

The vendor tags every such option `stream_type = 'addon'` with the channel's id and name on the row (`addon_id`, `addon_name`). Measured 2026-09-14, after the cleanup walks:

| | Prime | Apple | NOW |
|---|---|---|---|
| Channels the vendor lists for the UK | ~85 | ~50 | 3 passes (Cinema, Entertainment, Hayu) |
| Addon rows in `streaming_availability` | 18,166 | 2,699 | 318 (NOW is *only* passes) |
| Titles reachable **only** through a channel (no subscription/free row anywhere) | 11,895 | 1,694 | — |

The channels carrying the most channel-only titles on Prime: Crunchyroll 1,320 · Simply South 906 · HBO Max 776 · Eros Now 746 · discovery+ 628 · Sooner 443 · Shudder 406 · STUDIOCANAL Presents 344 · Channel 101 309 · Lionsgate+ 290 · Dekkoo 280 · BFI Player 279. Six of these (HBO Max, Paramount+, Discovery+, Crunchyroll, MUBI, Hayu) are **also standalone Videx services**, and the same title appears under both routes (`hbo` and `prime` + `addon_name = 'HBO Max'`).

## Where the app stands after the interim change (this PR)

| Surface | Before | After the interim PR |
|---|---|---|
| `titles.available_services` (drives For You / Home "on your services" filters) | addon rows counted → a channel-only title was "on Prime" for every Prime subscriber | addon rows excluded (migration 084) |
| Detail page, where-to-watch | addon rows invisible (service chips come from TMDb providers; rent/buy from SA rows; addon dropped) | new **"Via a channel"** list, labelled with the channel and parent, with a note that the channel subscription is needed |
| Search hits (`TitleHitCard`) | already treats only subscription/free as included | unchanged |
| Share page (`/t/`) | addon counted as "stream on" | skipped |
| Service fingerprints | addon rows already excluded (surprise-paywall rule) | unchanged |
| Onboarding / profile | no notion of channels | unchanged — this brief |

So after the interim PR nothing *claims* a channel-only title is included, and nothing lets a user *say* they hold a channel. That second half is the work.

## Recommendation: sub-entitlements of the parent, with three refinements

**1. One entitlement, not two tiles.** For a channel that is also a standalone Videx service, the entitlement is the service, however it is bought. A user picks "HBO Max" once; whether they get it direct or via Prime is a sub-option that only changes which deep link opens and which badge shows. No duplicate tiles, no duplicate taste or fingerprint signals, and the existing five wave-1 services keep working unchanged.

**2. Curate the picker.** Under the Prime tile (and Apple's, and NOW's) offer the channels that matter in the UK — a first list: HBO Max, Paramount+, Discovery+, Crunchyroll, MUBI, Hayu, ITVX Premium, MGM+, STUDIOCANAL Presents, Lionsgate+, Shudder, BFI Player, Curzon, Acorn TV; NOW's Cinema / Entertainment / Hayu. The tail (Simply South, Eros Now, Dekkoo, Channel 101 …) stays in the data as "via X on Prime" in where-to-watch and is never offered as an entitlement. The list is data, not code: a `service_addons` table (parent service, addon_id, display name, standalone service id if any, curated flag, sort) so it can be edited without a release.

**3. Availability follows entitlement.** A channel row counts as "on your services" only if the user holds the parent **and** the channel (or the standalone service it maps to). Otherwise it appears in where-to-watch labelled with the channel, and never in For You as if it were included.

## What changes, by layer

| Layer | Change | Notes |
|---|---|---|
| Schema | `service_addons` (curated registry, above); `user_services` gains a nullable `addon_id` (or a sibling `user_service_addons`); RLS as `user_services` | Migration 085+. Keep `user_services` rows for parents untouched so nothing breaks before the app ships. |
| Derivation | Replace the global `available_services` predicate (084 excludes addon) with a per-user resolution: `available_services` stays "reachable without a channel"; a second array `channel_services` (or a join at query time) answers "which channels carry it" | The engine's hard filter becomes `available_services && user_services OR channel match`. Measure query cost — `available_services` is GIN-indexed; a second array can be too. |
| Engine (`recommendations-v2/hardFilters.ts`, `server/homeRender.ts`, Worker `/v1/foryou`, `/v1/home`) | Accept the user's channel set from the profile; extend the overlap filter | The Worker's `VALID_SERVICE_IDS` contract must ship **before** the app (lesson from wave 1). |
| Shared adapters | `detailAdapter` already splits `channelOptions`; `classifyProviders` gains a tier for "on a channel you hold" (tier 1 styling) vs "via a channel you don't" (labelled) | Interim list from this PR becomes the "don't hold" case. |
| Native app | Onboarding service step: Prime / Apple / NOW tiles expand to a channel picker (curated list); Profile → services: same; where-to-watch: held channels join tier 1 | Design: chips under the parent tile, not a modal — one fewer step, and the parent stays the anchor. |
| Fingerprints / taste | Unchanged: addon rows stay out of fingerprints; a held channel that maps to a standalone service contributes as that service | The "surprise paywall" rule already lives in `platformAdapter.ts`. |
| Sync / ingestion | No change: rows already carry `addon_id`/`addon_name`; the relevance floor treats channel-only as "other" (200-vote floor) | Revisit the floor per curated channel if HBO Max via Prime deserves the included floor. |
| Store forms | Service selections are already a declared category; channels are more values of it | Confirm at release time. |

## Open questions for the build session

1. **Where does "HBO Max via Prime" sit for a user who holds HBO Max direct?** Proposal: the entitlement is HBO Max; the route is a preference with a default of "direct if the app is installed, else Prime". The deep link resolver already has a platform-aware fallback ladder to extend.
2. **Apple's channel ids are opaque (`tvs.sbd.1000439`)** and several names repeat (Paramount+ appears four times with different ids). The curated registry needs a name-level merge for Apple.
3. **NOW has no base subscription.** Its three passes are the entitlements; the NOW tile becomes a three-chip picker with no parent toggle. Also worth deciding whether Videx's NOW coverage (318 vendor titles today, IN-SC-003) justifies the work at all right now.
4. **How much of the 11,895 channel-only Prime titles is worth having** once the curated list exists — the relevance floor already keeps the tail out; the curated channels could be granted the included floor.

## Not in scope

Cross-service price comparison for rent/buy; a "cheapest way to watch" model; anything about Sky Go (still unmodelled, wave 2).

## Effort, rough

Schema + derivation + engine filter: ~2 days. Native onboarding/profile picker + where-to-watch tier: ~2–3 days. Worker contract + rollout ordering + device verification: ~1 day. Best done as one build session with a device check at the end, after the interim PR and migration 084 are live.
