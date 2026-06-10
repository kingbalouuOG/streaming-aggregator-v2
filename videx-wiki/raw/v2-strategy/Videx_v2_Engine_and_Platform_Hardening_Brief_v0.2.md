# Videx v2 — Engine & Platform Hardening Brief (E&P Track)

**Status:** Brief v0.2 (2026-06-10) — **approved by Joe; decisions locked (§9)**. Ready for ENG-1 implementation planning.
**Changes from v0.1 (same day):**
- §8 open questions resolved — all six recommendations confirmed by Joe; section rewritten as §9 Locked Decisions.
- New Phase REPO-1 (documentation & repo hygiene) added per Joe's request, slotted between ENG-1 and PLAT-1. Grounded in a repo scan (duplicate docs, one-off scripts, split test runners, minimal lint config — see §4).
- New §10 Cost Impact: the track adds **£0 today and ~£4/month (Workers Paid) from PLAT-3 onward** — the only new recurring line item.

**Origin:** Combined output of the June 2026 full-codebase architecture review (frontend, data layer, recommendation engine, docs/wiki) and the follow-on recommendation-engine deep-dive.
**Position in the roadmap:** Everything here sits **after Phase 5.5 (closed 2026-05-15)** and **before any v3 work (Phase 7, conversational discovery — untouched by this brief)**. Phase 6 launch-prep blockers (solicitor review, rate limits, keystore, etc. — see `videx-wiki/wiki/registers/pre-launch-blockers.md`) run in parallel and are not absorbed into this track.
**Strategy sources:**
- `docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.8.md` (engine ground truth)
- `docs/v2/Videx_v2_Project_Orchestration_v0.7.md` (process ground truth)
- `videx-wiki/wiki/concepts/architecture/recommendation-pipeline.md`, `taste-vector.md`
- `videx-wiki/wiki/registers/deferred-items.md` (CF at ~10K MAU and two-tower at ~50K MAU thresholds — unchanged by this brief)

---

## 1. What this track is

Three threads, interleaved deliberately:

**Engine thread (ENG):** the v2 engine is a *retrieval-then-heuristics* system. Two upgrades turn it into a *learning* system, and both are cheap relative to anything in the v3 parking lot:
1. **Multi-interest retrieval** — replace the single 1536D taste centroid with up to 3 interest centroids. Fixes the retrieval-stage ceiling (a user who picks "cozy British comedy" + "dark thrillers" at onboarding currently gets one averaged vector pointing at neither).
2. **Learned re-ranking** — replace the hand-tuned 62.5/25/12.5 Stage-2 weights with a small model trained on our own `card_impressions` → interaction outcomes. Data-gated: needs real launch traffic.

Plus two smaller engine fixes: avoid-set negative scoring (stop subtracting thumbs-down from the taste vector) and a deliberate exploration slot (structural defence against filter-bubble drift).

**Platform thread (PLAT):** the architecture review's structural findings:
1. Client data layer has no request dedup, no code-splitting, no virtualization, no image lazy-loading, and a 1,180-line `App.tsx` doing manual routing with 13–15-prop drilling.
2. TMDb/OMDB keys ship in the client bundle; every client hits third-party APIs directly (5 parallel calls per detail-page open). Global content reads should be CDN-cached behind a thin proxy.
3. The recommendation pipeline exists in **two implementations** (Edge `_shared/` mirror + client fallback) held together by drift CI and the `foryou-parity` probe — the single most expensive piece of accidental complexity in the codebase (ADR-011). It should become **one engine, server-side, with a feed cache**.

**Hygiene thread (REPO):** a bounded docs/repo-structure cleanup (added in v0.2, §4): dedupe and triage `docs/`, clear one-off script debris, consolidate the two test runners into one, ratchet lint rules, and write down the conventions — landing *before* PLAT-1 so the big client refactor is written under the new rules. Thereafter, every phase checklist ends with an in-phase bloat sweep (ADR-007 spirit: cleanup is continuous, not a deferred chore).

**Sequencing principle (per Joe, 2026-06-10):** engine refinements first, then platform changes, all before v3. ENG-2 (learned re-ranker) is data-gated on launch traffic, so it naturally lands last.

---

## 2. Phase sequence at a glance

| Phase | Name | Thread | Depends on | Gate to start | Rough size |
|---|---|---|---|---|---|
| ENG-1 | Multi-interest retrieval & signal quality | Engine | — | Brief approved ✅ | 2–3 weeks |
| REPO-1 | Documentation & repo hygiene | Hygiene | — | ENG-1 merged (doc-only items may land anytime as standalone PRs) | ~1 week |
| PLAT-1 | Client data layer & rendering | Platform | REPO-1 lint rules | REPO-1 merged | ~2 weeks |
| PLAT-2 | API edge & content proxy | Platform | — | PLAT-1 merged (query layer makes endpoint swaps one-liners) | 1–2 weeks |
| PLAT-3 | Single engine, server-side feed + cache | Platform | PLAT-2 infra | PLAT-2 merged | 2–3 weeks |
| — | *Phase 6 launch* | — | — | Pre-launch blockers cleared (parallel track) | — |
| ENG-2 | Learned re-ranker | Engine | ENG-1 (logging), launch traffic | Data gate: ≥5–10K impressions with ≥500 positive outcomes | 1–2 weeks build + gate wait |

Branch naming follows the existing convention: `phase-eng-1-multi-interest`, `phase-repo-1-hygiene`, `phase-plat-1-client-data-layer`, etc.

**Sequencing note (resolved, §9 D1):** ENG-1 runs before PLAT-3 and therefore pays the ADR-011 `_shared/` mirror tax one final time. Accepted: the mirror update is mechanical, `shared-tree-drift` CI protects it, and engine-first matches the priority call.

---

## 3. Phase ENG-1 — Multi-interest retrieval & signal quality

### 3.1 Objective

Fix the retrieval-stage quality ceiling and clean up three signal-handling weaknesses, using data we already have (onboarding cluster picks + interaction log). No dependency on real-user volume. Validates with the existing eval discipline (offline replay + `taste-profile-tester` rig).

### 3.2 Workstream A — Multi-interest centroids

**Today:** `taste_profiles.taste_vector_v2` is a single 1536D vector. Onboarding bootstrap averages the user's 3–5 selected clusters (plus service/watched signal) into one centroid; `match_titles_by_vector` retrieves 500 candidates by cosine to that one vector; every non-anchored row (Recommended For You, Hidden Gems, Outside Your Usual) inherits that pool. The EMA update drags the whole vector toward whatever was interacted with most recently.

**Change:**
- Maintain **K ≤ 3 interest centroids** per user (fixed cap of 3, locked §9 D3; adaptive K is an ENG-2-era refinement).
- **Bootstrap:** instead of collapsing selected clusters into one centroid, group the 3–5 selected clusters into K interest seeds (clusters with high pairwise centroid cosine merge into one interest; distant ones stay separate). Service/watched signal blends into each interest at the existing validated weights.
- **Ongoing:** during the existing 24h batch recompute, k-means (k=K) over the user's positively-interacted title embeddings refreshes centroids. The incremental EMA path updates the **nearest centroid only** (assignment by cosine), with the existing learning rate and confidence-floor logic unchanged.
- **Retrieval:** per-centroid pool fetch via the existing `match_titles_by_vector` RPC (e.g., 200 per centroid), dedupe on `(tmdb_id, media_type)`, tag each candidate with its source interest, interleave pools proportional to interest weight (share of recent positive interactions).
- **Scoring:** taste-similarity component = cosine to the candidate's *source* centroid (not max-over-centroids — keeps rows coherent). Stage 2 weights, MMR, de-clustering, sliders: all unchanged.
- **Storage:** new table `user_interest_centroids` (`user_id`, `slot` smallint, `centroid` vector(1536), `weight` real, `updated_at`) with owner-scoped RLS, rather than widening `taste_profiles`. `taste_vector_v2` continues to be maintained (single-centroid summary is still used by mood-room affinity and serves as fallback) — it's cheap to keep both.
- **Migration:** next free number (044 at time of writing).

### 3.3 Workstream B — Avoid-set negative scoring

**Today:** `thumbs_down` applies weight −0.6 *into the EMA vector*. In embedding space, moving away from a point is not the same as avoiding a region, and it corrupts what the positive vector encodes.

**Change:**
- Remove negative-weight events from the vector-update path (incremental and batch).
- Maintain a per-user **avoid set**: embeddings of the most recent N=50 `thumbs_down` + `not_interested` titles. Derivable entirely from the `user_interactions` event log at batch-recompute time — fully replayable, no backfill migration needed; cache alongside the embedding cache.
- Scoring-time penalty: `finalScore −= γ · max_cosine(candidate, avoidSet)`, γ starting at 0.15, tuned in the eval gate.

### 3.4 Workstream C — Exploration slot

- Reserve 1–2 positions in the Recommended For You row for **exploration candidates**: zero prior impressions for this user, moderate-similarity band (roughly the 40th–70th cosine percentile of the pool), popularity-weighted sampling.
- Tag with `metadata.exploration = true` in `card_impressions` so ENG-2 can measure exploration CTR separately.
- This formalises what "Outside Your Usual" gestures at, inside the flagship row where it matters.

### 3.5 Workstream D — Training-data groundwork for ENG-2

- `card_impressions` already logs `position`, `source_surface`, `session_id` — good. Add position-at-click to interaction `metadata` where the click originates from a ranked surface.
- Define the **training extract** now: a SQL view joining impressions to outcome events (click/watchlist/deep-link within the session), so the day real traffic arrives, the dataset accumulates in the right shape. Positional bias is handled at training time (ENG-2), but the position field must be reliable from day one.

### 3.6 Eval gate (phase exit)

- **Offline replay:** for prototype + synthetic profiles (via the `taste-profile-tester` rig), hold out the last 20% of positive interactions; measure **recall@500** of held-out titles in the candidate pool — multi-interest must beat the single-centroid baseline.
- **Coverage check:** for a multi-modal test profile (e.g., comedy + thriller cluster picks), top-20 of the main row must surface ≥2 distinct interests; today's baseline demonstrably fails this.
- **Avoid-set check:** thumbs-downed titles' nearest neighbours measurably suppressed without recall regression on positives.
- `rank-eval.ts` runs as usual; parity probe must stay green (both trees updated).

### 3.7 Out of scope for ENG-1

Embedding model/template changes (locked per ADR-004), mood-room changes, any Stage-2 weight changes (that's ENG-2), collaborative signals.

---

## 4. Phase REPO-1 — Documentation & repo hygiene

### 4.1 Objective

A bounded cleanup of documentation, repo structure, tests, and lint conventions — landing before PLAT-1 so the client refactor is written under the tightened rules. Findings below come from a June 2026 repo scan; each is concrete, not speculative.

### 4.2 Workstream A — Docs consolidation

1. **Duplicates:** `phase-2-6-decision.md` and `phase-2-6-variance-eval.md` exist at both `docs/v2/` root *and* `docs/v2/phase-summaries/`. Keep the `phase-summaries/` copies; delete the root duplicates.
2. **Stale interim docs:** triage `docs/component-specs.md`, `docs/MIGRATION_NOTES.md`, `docs/context-update-b1-e1.md` — delete if superseded (git history preserves them), or move under a dated `docs/v2/` location if still load-bearing.
3. **`docs/v3-design/` naming collision:** this folder holds the *current shipped* design system (`design-system.md` is cited as source of truth by the Search V2 briefs), but "v3" elsewhere means Phase 7 conversational discovery. Rename to `docs/design/` and update all referencing docs. Co-locate the search briefs currently split across `docs/v2/` and `docs/v3-design/search/`.
4. **Doc lifecycle rule (write it down):** active briefs/strategy live in `docs/v2/`; superseded versions get a one-line "superseded by …" header rather than deletion; phase outputs land only in `docs/v2/phase-summaries/`.
5. **Wiki refresh:** `videx-wiki/raw/` snapshots lag the live docs (engine strategy v1.6.3 in raw vs v1.8 live; orchestration v0.3.3 vs v0.7). Re-snapshot is human-owned per `AGENTS.md` (Joe drops the files), then a re-ingest + **lint pass** (orphans, contradictions) runs as part of this phase.
6. **README:** verify the 21KB root README against post-5.5 reality; trim anything the wiki now owns.

### 4.3 Workstream B — Repo structure

1. **`scripts/` debris:** one-off investigation artefacts sit alongside production pipelines — `_inspect_bbc_sa.mjs`, `_inspect_foryou_parity.mjs`, `_inspect_impressions.mjs`, `_measure_foryou_pool_size.mjs`, `in-465-tmdb-sample.ts`, `sync-bbc-iplayer-backfill.mjs`, `visual.mjs`, `audit-results/`. Delete (git history keeps them — same precedent as the Feb 2026 cleanup); anything genuinely reusable moves into the named subfolder it belongs to (`evaluation/`, `enrichment/`, …).
2. **Parked DB drop:** confirm `title_genres` / `title_credits` are empty in production, then execute the parked drop (deferred-items register) as a small migration in this phase's window. If `title_credits` turns out non-empty, leave it and note why.
3. **Worker home (forward-looking):** `workers/api/` created empty with a README stub in this phase so PLAT-2 lands into an agreed location (plain folder, not a workspace split — locked §9 D6).

### 4.4 Workstream C — Test & lint conventions

1. **One test runner:** `package.json` carries ~8 bespoke `npx tsx` test scripts *and* vitest. Migrate the tsx unit tests (search, taste-v2, fingerprints, embeddings, enrichment) into vitest suites so `npm test` is the single entry point and CI runs one thing. `eval:*` scripts are evals, not tests — they stay as-is.
2. **Lint ratchet** (current `eslint.config.mjs` is minimal — recommended + react-hooks + `no-explicit-any` demoted to warn):
   - Add `eslint-plugin-react` with `react/jsx-no-leaked-render` — our own post-mortem (`docs/solutions/logic-errors/react-numeric-falsy-renders-zero.md`) recommends exactly this rule; it has bitten us in production once already.
   - Burn down the ~20 `any` instances (mostly TMDb adapter boundaries — type them via the generated `database.types.ts` / response interfaces), then promote `@typescript-eslint/no-explicit-any` warn → error.
   - Un-ignore `scripts/**` with a relaxed profile (it currently gets zero linting).
3. **Conventions doc:** a single `docs/CONVENTIONS.md` capturing what's currently tribal: naming, where things live (lib vs hooks vs components), the test/eval split, the doc lifecycle rule from §4.2, migration vs `supabase/cron/` ownership, and the in-phase cleanup rule.

### 4.5 Acceptance

- `npm test` is the single test entry and is green; the bespoke `test:*` tsx scripts are gone from `package.json`.
- `npm run lint` green under the ratcheted rules; `no-explicit-any` at error.
- No duplicate or orphaned docs under `docs/`; wiki lint log entry shows zero unresolved contradictions.
- `docs/CONVENTIONS.md` exists and is linked from the README.

---

## 5. Phase PLAT-1 — Client data layer & rendering

### 5.1 Objective

Replace the hand-rolled fetch/cache orchestration with a server-state library and fix the four mechanical rendering gaps. This is an in-place refactor — no backend changes, no schema changes.

### 5.2 Scope

1. **TanStack Query** as the single server-state layer:
   - QueryClient + `persistQueryClient` (localStorage/IDB) replaces the bespoke TTL logic in `src/lib/api/cache.ts` and the sessionStorage section caches.
   - Existing API clients become `queryFn`s; TTLs map to `staleTime`/`gcTime` (TMDb 24h, OMDB 7d, SA 24h — unchanged semantics).
   - Request dedup, stale-while-revalidate, and offline persistence come free. This directly kills the top two frontend findings (no dedup — 5 parallel calls per detail open; waterfalls in `useForYouContent`/`useHomeContent`).
   - Migration order, one hook per PR-sized chunk: `useContentDetail` → `useSectionData` → `useHomeContent` → `useSearch`/`useBrowse` → `useForYouContent` last (it shrinks dramatically again in PLAT-3, so do the minimum here).
2. **Code-splitting:** `React.lazy` + Suspense per top-level page (Home, ForYou, Browse, Watchlist, Profile, Detail, Onboarding). No router adoption (locked §9 D5) — the existing tab-state + Capacitor back-button stack stays.
3. **List virtualization:** TanStack Virtual on WatchlistPage, Browse results grid, CalendarPage.
4. **Image lazy-loading:** IntersectionObserver in `ImageSkeleton` + native `loading="lazy"`; LQIP blur-up from TMDb `w92` renditions. Home currently eager-loads ~80 posters.
5. **State cleanup:** small Zustand store for genuinely app-level state (active tab, filters, watchlist ids, user services); `memo()` on card/row primitives. Target: `BrowsePage` and `DetailPage` drop from 13–15 props to ≤5.

### 5.3 Acceptance

- Bundle: initial JS chunk measurably smaller (record before/after from `vite build` output; target ≥30% reduction of eagerly-loaded JS).
- Device cold-start before/after on the test phone.
- Network log shows zero duplicate concurrent identical requests on a Home → Detail → Back → Detail flow.
- 500-item synthetic watchlist scrolls without jank.
- No behaviour change: For You/Home output identical (this phase must not touch ranking).

---

## 6. Phase PLAT-2 — API edge & content proxy

### 6.1 Objective

Move third-party API access server-side behind a thin always-warm proxy with CDN caching. Removes bundled TMDb/OMDB keys, collapses N-clients × M-calls into shared cached reads, and stands up the infrastructure PLAT-3 needs.

### 6.2 Infrastructure (locked §9 D2)

**Cloudflare Workers + Hono.** Rationale: zero cold starts (the documented Achilles heel of the Supabase Edge path), Cache API + CDN built in, free tier covers current scale, and — decisive for PLAT-3 — **wrangler bundles from anywhere in the repo**, so a Worker can import `src/lib/recommendations-v2/` directly, dissolving the ADR-011 `_shared/` constraint rather than working around it.

### 6.3 Scope

1. `workers/api/` — Hono app, deployed via wrangler, CI deploy on merge. (Folder created in REPO-1.)
2. Endpoints, in order of duplication factor:
   - `GET /v1/title/:type/:id` — merged TMDb detail + OMDB ratings (+ availability passthrough), `Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400`.
   - `GET /v1/discover`, `GET /v1/search`, `GET /v1/trending` — shorter s-maxage (1–6h).
3. TMDb + OMDB keys become Worker secrets; `VITE_TMDB_API_KEY` / `VITE_OMDB_API_KEY` deleted from the client env. Client bundle ships only Supabase URL + anon key.
4. Client `queryFn`s repointed at the proxy (one-liners thanks to PLAT-1).
5. Supabase content-cache reads (`streaming_availability`, etc.) stay client→Supabase for now; revisit proxying them only if measurement says so.

### 6.4 Acceptance

- `grep` of `dist/` shows no TMDb/OMDB keys.
- Worker analytics shows cache-hit ratio on `/v1/title/*` (expect very high once warm).
- p95 detail-page data latency equal or better than direct-to-TMDb baseline.
- TMDb/OMDB request volume from clients drops to ~zero.

---

## 7. Phase PLAT-3 — Single engine, server-side feed + cache

### 7.1 Objective

One implementation of the recommendation engine, running server-side, with a feed cache — and the deletion of the parity apparatus that exists only because there are currently two.

### 7.2 Scope

1. **Port `render-foryou-rows` to a Worker route** (`GET /v1/foryou`), importing `src/lib/recommendations-v2/` + `src/lib/taste-v2/` directly (no mirror). Service-role Supabase access from the Worker for candidate RPCs; user identified by Supabase JWT passed through and verified.
2. **Response shape preserves the slider UX:** rows + a compact scored-candidate payload (ids, per-component scores, source-interest tags) so slider drags continue to re-rank **client-side, instantly, with no refetch** — this is the part of the current design explicitly worth keeping.
3. **Feed cache:** Workers KV/Cache API keyed `userId : taste_vector_updated_at : sliderHash`, TTL 15–30 min. The `taste_vector_updated_at` key component reuses the existing embedding-cache invalidation trick — an interaction that updates the vector naturally busts the feed cache.
4. **Batch recompute off the hot path:** the >24h-stale full taste recompute moves to a scheduled Worker/cron job (or stays in the existing cron pattern) — never again blocking a For You load.
5. **Deletions** (the payoff): `supabase/functions/_shared/recommendations-v2/` + `_shared/taste-v2/` mirrors, `shared-tree-drift` workflow, `foryou-parity` CI (run once as final validation, then retire), the `warmup-foryou` Variant A hack, and the 1.5s-timeout-then-client-fallback dance in `useForYouContent`.
6. **Client fallback policy (locked §9 D4):** keep the client pipeline as an offline/error fallback for one release after cutover, then delete. ADR required — supersedes ADR-011 and ADR-012.

### 7.3 Acceptance

- For You p95 first-paint at or better than current warm-Edge path; cold-start outliers (5–12s today) eliminated as a category.
- Parity probe green on final pre-cutover run.
- Feed cache hit ratio measured; repeat For You loads within TTL serve from cache.
- LOC/CI deleted is tracked in the phase summary — the simplification is a first-class deliverable.

---

## 8. Phase ENG-2 — Learned re-ranker (data-gated)

### 8.1 Gate

Real launch traffic: **≥5–10K impressions with ≥500 positive outcomes** (click/watchlist/deep-link) in the ENG-1 training extract view. Do not start before the gate — a model trained on two prototype users is noise.

### 8.2 Scope

1. **Model v1: logistic regression** over features the pipeline already computes: source-centroid cosine, recency score, popularity, genre-match count, service, time-of-day bucket, media type. Position included at training time for debiasing, dropped at serve. (GBDT later only if LR plateaus — keep it boring first.)
2. **Training:** nightly script following the existing GitHub Actions + scripts precedent (HDBSCAN cron is the model). Artifact = a small weights JSON written to Supabase (or Worker KV); the Stage-2 scorer loads it and falls back to the hand-tuned constants if absent. The fixed 62.5/25/12.5 split becomes the fallback, not the law.
3. **Offline eval before any serve change:** AUC / NDCG vs the fixed-weight scorer on a held-out week. Ship only if better; keep shipping decisions in a dated eval doc per house convention.
4. **Exploration measurement:** report CTR on `exploration=true` impressions vs row baseline (from ENG-1 tagging) — first read on whether exploration earns its slots.
5. **Observability:** per-row CTR / save-rate dashboard (SQL over impressions + interactions; `supabase/queries/` pattern) — the engine finally gets online metrics.

---

## 9. Locked decisions (confirmed by Joe, 2026-06-10)

| # | Decision | Outcome |
|---|---|---|
| D1 | ENG-1 vs PLAT-3 ordering | **ENG-1 first.** Pay the `_shared/` mirror tax one final time; mechanical, CI-protected. |
| D2 | Proxy/feed infrastructure | **Cloudflare Workers + Hono.** Cold starts, CDN caching, and ADR-011 dissolution all point the same way. |
| D3 | Interest-centroid K | **Fixed cap of 3** for v1; adaptive K is an ENG-2-era refinement. |
| D4 | Client pipeline post-PLAT-3 | **Keep as fallback for one release, then delete.** |
| D5 | Router adoption in PLAT-1 | **`React.lazy` only.** Tab-state + back-button stack stays; router is YAGNI until web distribution matters. |
| D6 | Worker code location | **Plain `workers/api/` folder.** Workspace split only if a second app target appears. |

---

## 10. Cost impact

Summary: **£0 in new costs until PLAT-3; from PLAT-3, one new line item of ~£4/month (Cloudflare Workers Paid, $5/mo).** Everything else rides existing plans, and two existing cost-pressure points get *relief*.

| Phase | New cost | Detail |
|---|---|---|
| ENG-1 | £0 | New `user_interest_centroids` table ≈ 18KB/user (3 × 1536 × 4B) — negligible. Retrieval becomes up to 3 smaller RPCs instead of 1 — inside existing Supabase Pro compute. |
| REPO-1 | £0 | One new dev dependency (`eslint-plugin-react`). |
| PLAT-1 | £0 | TanStack Query/Virtual, Zustand — MIT, no services. |
| PLAT-2 | £0 | Workers **free plan**: 100K requests/day and 10ms CPU/request — the proxy endpoints (fetch + cache + JSON merge) fit comfortably at current and early-launch scale. Cloudflare account free; `workers.dev` subdomain, no domain purchase needed. |
| PLAT-3 | **~£4/mo** | Workers **Paid ($5/mo)** recommended at cutover: feed assembly (500-candidate scoring + MMR) can exceed the free plan's 10ms CPU cap; Paid lifts it to 30s and expands KV quotas. This is the only new recurring cost in the track. |
| ENG-2 | £0 | Nightly LR training ≈ 2–5 min/run ≈ 150 GitHub Actions min/month — inside the free private-repo tier (2,000 min/mo) alongside the existing monthly HDBSCAN cron. OpenAI embedding spend unchanged (~£0.50/mo). |

Offsets and relief:
- **OMDB:** CDN-cached proxy reads collapse per-client OMDB calls — defers (possibly permanently) the paid OMDB tier as users grow.
- **Supabase:** PLAT-3 removes the `warmup-foryou` pings and Edge Function invocations from the For You path, and CDN caching cuts egress against the Pro plan's included quota.
- **At scale:** beyond Paid's included 10M requests/month, Workers bills $0.30/million — cost growth is tied to user growth, not to this track's architecture.

---

## 11. Explicitly not in this track

- **v3 / Phase 7** (Graphiti/Kuzu conversational discovery, KG explanations) — untouched, still gated on v2 metrics baseline.
- **Collaborative filtering** (<10K MAU threshold stands) and **two-tower** (<50K MAU + 6mo data).
- **Embedding model/template swap** (ADR-004 lock stands; the taste-vs-text-semantics gap is real but its fix — a learned projection on co-engagement pairs — needs users first).
- **LLM-as-ranker** for the core feed (slow, expensive, worse than the pipeline at ranking).
- **React Native rewrite** (stay Capacitor; PLAT-1 closes most of the perceived-performance gap).
- **Mood-room expansion** and the v2.5 deferred items — unchanged priority.

## 12. Process notes

- Each phase: feature branch → Joe reviews plan → implementation → eval gate → phase summary in `docs/v2/phase-summaries/` → wiki ingest rides the phase PR (per `videx-wiki/AGENTS.md`).
- Every phase checklist ends with an **in-phase bloat sweep**: dead code deleted, docs touched by the phase updated, no new one-off scripts left at `scripts/` root.
- Migrations: ENG-1 expects one (044, `user_interest_centroids`); REPO-1 possibly one (the parked `title_genres`/`title_credits` drop, if confirmed empty). PLAT phases expect none. ENG-2 expects at most a view + a weights table.
- Orchestration doc gets a v0.8 bump at ENG-1 kickoff (new §3.4 rows + §11 locks for D1–D6 and the ADR-011 supersession path).
