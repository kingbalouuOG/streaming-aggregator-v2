---
title: For You surface
type: concept
tags: [for-you, surface, personalised, sliders, mood-rooms, anchored-rooms, edge-function]
created: 2026-04-26
updated: 2026-04-30
sources:
  - raw/v2-strategy/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.4.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.7.md
  - raw/phase-summaries/phase-4-summary.md
related:
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/home-surface.md
  - wiki/concepts/architecture/sliders.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/operations/phase-4.md
---

# For You surface

Personalised mode. Heavy ranking, sliders, mood rooms. Service-filtered. Maximum 7-8 rows. Sliders Option C dual-access (canonical state in Profile, contextual access here via collapsed entry that opens as modal/tray).

## Row composition (in order)

0. **Sliders entry point** — collapsed "Tune your recommendations" affordance. Opens as bottom-sheet tray (`SliderTray.tsx`).
1. **Recommended For You** — top ~20 from full pipeline (taste 62.5% / recency 25% / contextual 12.5% scoring + content-mix → genre-spread → de-cluster post-processing).
2. **Mood Rooms for Tonight** — title-anchored. 5 anchored rooms per weekly refresh, named "If you love {anchor}". Anchor selection from a tiered ladder (behavioural intersection → cluster representatives → top-finalScore fallback). Rooms generated on demand via `buildAnchoredRoom`; 30 titles per room. (Phase 4.5 redirect, April 2026 — replaced the original global-cosine-ranked row from Gates 1–4.)
3. **Hidden Gems** — popularity 2-20, vote_count ≥ 50, vote_average ≥ 7.0; genre cap 2 per genre; max 15.
4. **Because You Watched [Title]** — anchors satisfy BOTH `watchlist_add` (or `watched`) AND `thumbs_up` in last 60 days. Top 2 anchors. Per-anchor neighbours via `buildAnchoredRoom` (shared primitive with row 2; Phase 4.5 redirect migrated this row from `fetchAnchorNeighbours`). Anchor metadata fetched separately (watchlist hard filter excludes from main pool).
5. **More From [Director/Actor]** — person in ≥2 thumbs-up titles. Director preferred for movie-heavy users (≥60% movies); else actor. Min 5 available titles.
6. **Outside Your Usual** — bottom 30% cosine similarity but `finalScore ≥ median + IMDb ≥ 7.0`. Count modulated by Comfort Zone slider (5-15).
7. **From Your Watchlist** — unwatched watchlist items, recency-ordered.

## Locked rules

- Hard-filtered by user services.
- Heavy personalisation: every row taste-aware.
- Mood rooms are the dominant row type (per Pillar 1 USP).
- Sliders Option C dual-access.
- Deep catalogue-friendly: Hidden Gems, back-catalogue surfacing.
- Mood-adaptive: time-of-day reorders the weekly pool.

## Phase 4 implementation note

Brief lists 5 Stage 2 weights summing to 1.0. Phase 4 ships 3 scoring components (62.5/25/12.5: taste/recency/contextual placeholder) + 2 post-processing stages (genre-spread, service de-clustering). MMR deferred to Phase 5 (would require ~3MB transfer + ~23M float ops per page load). Pluggable for Phase 5 swap. Strategy §5.2 carries the implementation note.

## Cold-start behaviour

- Recommended For You populated from bootstrap vector (service fingerprints + watched-grid + genre selections).
- Mood rooms populated via Tier 2 of the anchor ladder (cluster representatives ranked by similarity to the cold-start taste vector). Tier 1 is empty until behavioural signal accumulates; Tier 3 fires only if Tier 1+2 yield < 5.
- Hidden Gems populated (global category × cold-start fit).
- Because You Watched, More From [Person]: hidden until signals exist.
- Exploration row: present.
- From Your Watchlist: hidden until items exist.

## Caching

Rendered rows cached 10-20 minutes. Shorter TTL because taste-sensitive. Invalidated on any explicit signal (thumbs ±, watchlist ±, marked watched, not interested), slider change, service change, hourly refresh.

Anchored mood rooms: anchor selections cached in localStorage by `(userId, weekBucket)`; room contents recomputed every render. Underlying global rooms cluster membership cached for days (changes monthly via the GitHub Actions cron) — relevant to v2.5 browse, not For You.

## Performance

~260ms time-to-first-render with warm filter sets (profile 75ms + pool 183ms) per Phase 4 actuals (warm-cache client path).

Cold path post-Phase-4.5 quick wins: ~2-3s on residential WAN. IN-466 server-side render via the `render-foryou-rows` Edge Function (April 2026, [ADR-012](../decisions/adr-012-server-side-foryou-render.md)) collapses this to ~850ms warm wallclock by replacing 5-8 sequential client → Postgres round trips with one client → Edge Function call. Cold instances still take 5-12s; mitigated by Variant A warm-pinger (`warmup-foryou` fires from App.tsx mount).

## Server-side render path

`useForYouContent` invokes `render-foryou-rows` as the primary path. On any failure (5xx, malformed JSON, network, >1.5s timeout) the hook falls through to the existing client-side pipeline — the fallback contract is the resilience layer that makes the Edge Function safe to ship.

Edge Function returns the full first-viewport payload in one JSON response: all six row types + 5 anchored mood rooms (with thumbnails + cached LLM labels) + the 500-candidate pool (so client-side slider rerank stays instant). Auth: service-role + manual JWT decode + a `withUserScope(uid)` helper that enforces user scoping on every read since RLS is bypassed.

Pipeline code lives in `supabase/functions/_shared/recommendations-v2/` and `_shared/taste-v2/` (mirror of `src/lib/`, ADR-011). The `shared-tree-drift` CI workflow fails any PR that touches one tree without the other.
