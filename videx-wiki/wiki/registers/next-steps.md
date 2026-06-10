---
title: Next steps — E&P Hardening track → launch → ENG-2
type: register
tags: [register, next-steps, e-p-track, plat-1, plat-2, plat-3, phase-6, eng-2, roadmap]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/v2-strategy/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.8.md
  - raw/phase-summaries/phase-repo-1-summary.md
  - raw/phase-summaries/phase-eng-1-summary.md
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.7.md
related:
  - wiki/sources/ep-hardening-brief-v0-2.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/registers/deferred-items.md
  - wiki/registers/acceptance-gates.md
  - wiki/registers/parking-lot.md
  - wiki/concepts/operations/phase-eng-1.md
  - wiki/concepts/operations/phase-repo-1.md
  - wiki/concepts/operations/phase-history.md
---

# Next steps

The roadmap is the **E&P Hardening track** (brief v0.2, approved + decisions D1–D6 locked 2026-06-10; orchestration v0.8 §11): ENG-1 ✅ → REPO-1 ✅ (pending merge) → PLAT-1 → PLAT-2 → PLAT-3 → Phase 6 launch (parallel track) → ENG-2 (data-gated). All before v3 / Phase 7.

## Now — close out REPO-1

| # | Task | Status |
|---|---|---|
| 1 | Merge `phase-repo-1-hygiene` to main (`--no-ff`) | ⏳ The only remaining REPO-1 step. Migration 046 applied (live schema snapshot 2026-06-10 is post-046); raw/ re-snapshot dropped + re-ingested 2026-06-10. |
| 2 | `typegen-check` green post-046 | Should now pass — regenerates from the remote schema, which no longer has `title_genres`/`title_credits`. Verify on the PR. |

## PLAT-1 — Client data layer & rendering (next phase; gate: REPO-1 merged)

In-place refactor, no backend/schema changes, written under the REPO-1 lint rules. Brief §5; ~2 weeks nominal.

| Task | Notes |
|---|---|
| TanStack Query as the single server-state layer | QueryClient + `persistQueryClient` replaces bespoke TTL logic in `src/lib/api/cache.ts` + sessionStorage section caches. TTLs → `staleTime`/`gcTime` (TMDb 24h, OMDB 7d, SA 24h unchanged). Kills request dup (5 parallel calls per detail open) + waterfalls. Migration order, one hook per PR-sized chunk: `useContentDetail` → `useSectionData` → `useHomeContent` → `useSearch`/`useBrowse` → `useForYouContent` last (shrinks again in PLAT-3 — do the minimum). |
| Code-splitting | `React.lazy` + Suspense per top-level page. **No router** (D5) — tab-state + Capacitor back-button stack stays. |
| List virtualization | TanStack Virtual on WatchlistPage, Browse results grid, CalendarPage. |
| Image lazy-loading | IntersectionObserver in `ImageSkeleton` + native `loading="lazy"`; LQIP blur-up from TMDb `w92`. Home eager-loads ~80 posters today. |
| State cleanup | Small Zustand store (active tab, filters, watchlist ids, user services) + `memo()` on card/row primitives. Target: BrowsePage/DetailPage 13–15 props → ≤5. Absorbs the long-deferred IN-462 store idea. |

Acceptance: see [acceptance-gates](acceptance-gates.md) (≥30% eager-JS reduction, zero duplicate concurrent requests, 500-item watchlist scrolls clean, **no ranking behaviour change**).

## PLAT-2 — API edge & content proxy (gate: PLAT-1 merged)

Brief §6; 1–2 weeks. Infrastructure locked: **Cloudflare Workers + Hono** (D2), free plan suffices at this stage.

| Task | Notes |
|---|---|
| `workers/api/` Hono app + wrangler CI deploy | Folder stub created in REPO-1 (D6). |
| Endpoints by duplication factor | `GET /v1/title/:type/:id` (TMDb + OMDB merged, s-maxage=86400 + SWR) first; then `/v1/discover`, `/v1/search`, `/v1/trending` (1–6h). |
| Keys server-side | TMDb/OMDB keys → Worker secrets; `VITE_TMDB_API_KEY`/`VITE_OMDB_API_KEY` deleted; client ships only Supabase URL + anon key. |
| Repoint client `queryFn`s | One-liners thanks to PLAT-1. Supabase content-cache reads stay client→Supabase for now. |

## PLAT-3 — Single engine, server-side feed + cache (gate: PLAT-2 merged)

Brief §7; 2–3 weeks. The ADR-011/ADR-012 supersession point — **new ADR required at cutover**. Only new recurring cost in the track: Workers Paid ~£4/mo.

| Task | Notes |
|---|---|
| Port `render-foryou-rows` to a Worker route (`GET /v1/foryou`) | Imports `src/lib/recommendations-v2/` + `taste-v2/` directly — no mirror. Service-role Supabase from the Worker; user JWT verified. |
| Preserve slider UX | Response = rows + compact scored-candidate payload so slider drags re-rank client-side instantly, no refetch. |
| Feed cache | Workers KV/Cache API keyed `userId : taste_vector_updated_at : sliderHash`, TTL 15–30 min; vector updates naturally bust it. |
| Batch recompute off the hot path | >24h-stale full taste recompute → scheduled job, never blocking a For You load. Also the natural home for IN-PX-57's SQL anti-join. |
| **Deletions (the payoff)** | `_shared/recommendations-v2/` + `_shared/taste-v2/` mirrors, `shared-tree-drift` workflow, `foryou-parity` CI (one final validation run, then retire), `warmup-foryou`, the 1.5s-timeout fallback dance. LOC/CI deleted tracked in the phase summary as a first-class deliverable. |
| Client pipeline | Kept as offline/error fallback for **one release post-cutover, then deleted** (D4). |

## Phase 6 — Launch (parallel track, not part of E&P sequencing)

Per strategy §7.2 + brief positioning: run the [pre-launch blockers register](pre-launch-blockers.md) (14 open at last refresh — headline: IN-XPS-014 UK solicitor review of Privacy Policy/ToS, hard blocker). Release keystore + `signingConfigs.release`, versionCode/Name bump, release tag. `username_available` rate-limit (IN-PX-29), `extractUserIdFromJwt` defence-in-depth (IN-PX-30), cryptographic service-role JWT rotation (IN-XPS-004, pending Supabase tooling). Apply `040_editor_notes.sql` before Phase 6 editorial features go live. IN-PX-50 (scheduled catalogue-gap backfill Edge Function).

## ENG-2 — Learned re-ranker (data-gated; lands last)

**Do not start before the gate: ≥5–10K impressions with ≥500 positive outcomes** in `v_training_examples` (real launch traffic — a model trained on two prototype users is noise). Brief §8.

| Task | Notes |
|---|---|
| Logistic regression v1 over existing pipeline features | Position included at training for debias, dropped at serve. GBDT only if LR plateaus. |
| Nightly training via GitHub Actions (HDBSCAN cron precedent) | Artifact = weights JSON in Supabase/KV; Stage-2 scorer loads it, falls back to 62.5/25/12.5 constants. |
| Offline eval before any serve change | AUC/NDCG vs fixed weights on a held-out week; dated eval doc per house convention. |
| Exploration CTR read | `exploration=true` impressions vs row baseline (ENG-1 tagging). |
| Observability | Per-row CTR / save-rate dashboard (`supabase/queries/` pattern). |
| Era refinements unlocked | Adaptive K (D3), recall@500 measurement at scale (carried from ENG-1), IN-PX-56 media_type decision if evals show the 0.8% noise matters. |

## Standing / time-triggered

| Trigger | Action |
|---|---|
| Any time pre-launch (Joe-owned) | IN-PX-55: expand cluster rep lists to ~8–10 per cluster; re-run `eval:eng1` §A. IN-PX-40: author the 20-query semantic-eval fixture (gates `search_semantic` flag-flip beyond Joe). |
| First month tick-over | Verify pg_partman auto-creates partitions (IN-XPS-003). |
| 3 monthly mood-room recluster runs | Re-evaluate coverage (IN-459). |
| `actions/setup-python` v6 ships | Upgrade workflow YAML (IN-460). |
| May 2026 cron *(overdue — check)* | Review `FORBIDDEN_WORDS` carve-outs (IN-461). |
| Quarterly | Refresh `platformPricing.ts` (IN-XPS-007) + provider IDs in `platforms.ts`. |

## Explicitly later

See [deferred items](deferred-items.md) — v2.5 cluster, v3/Phase 7 conversational discovery (untouched by the E&P track, still gated on the v2 metrics baseline), CF at ~10K MAU, two-tower at ~50K MAU.
