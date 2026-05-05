---
title: Architecture Decision Records (Combined)
generated: 2026-04-26
sources: [docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md, docs/v2/Videx_v2_Project_Orchestration_v0.3.3.md, docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md, docs/context-update-b1-e1.md]
---

# Architecture Decision Records

Each ADR follows: Context → Decision → Consequences → Status. ADRs are extracted from the v2 strategy and orchestration documents to make individual decisions queryable. Status: all locked unless noted.

---

## ADR-001 — WatchMode replaced by Streaming Availability API

- **Status:** locked, applied (B1-E1, March 2026).
- **Context:** WatchMode provided UK availability data and deep links but had a small UK service catalogue, no rent/buy pricing, and a deprecated v1 API. Streaming Availability API (Movie of the Night) covers more UK services with deeper data and exposes pricing.
- **Decision:** Remove WatchMode entirely. Use SA API as the source of UK deep links and rent/buy pricing. Cache SA API data in Supabase; client reads from Supabase, not directly from SA API. SA API key is server-side only.
- **Consequences:**
  - Pros: deep links + pricing for 8/10 UK services; durable Supabase cache; no client-side quota burn.
  - Cons: BBC iPlayer empty, Sky Go absent (upstream gaps); requires ongoing sync infrastructure.
- **Reference:** `docs/context-update-b1-e1.md`, `docs/solutions/integration-issues/sa-api-uk-service-coverage-gaps.md`.

---

## ADR-002 — Two-surface architecture (Home + For You)

- **Status:** locked.
- **Context:** v1 used a single homepage that mixed trending, new releases, and personalised content. Every row competed for attention; the mental model was muddled.
- **Decision:** Split into Home (discovery, light personalisation) and For You (heavy personalisation, sliders, mood rooms). Both as primary bottom-nav tabs. Land users on For You after onboarding.
- **Consequences:** clearer mental model per surface; allows aggressive personalisation in For You without distorting Home; doubles the surface count to design and maintain.
- **Reference:** Composition Hypothesis v0.3.

---

## ADR-003 — Supabase Free → Pro tier

- **Status:** locked, applied Phase 1.
- **Context:** Free tier compute is insufficient for HNSW index build on 20K+ embeddings, and PITR requires Pro.
- **Decision:** Upgrade to Pro for the duration of v2 build and beyond. Compute add-ons reserved for HNSW rebuild windows.
- **Consequences:** ~£25/month baseline cost; PITR enabled; larger CPU window during index builds.
- **Reference:** Project Orchestration v0.3.3 §3.

---

## ADR-004 — 24D archetype vector replaced by 1536D embedding

- **Status:** locked, applied Phases 1-3.
- **Context:** v1 used a hand-designed 24D vector (19 genre + 5 meta dimensions). Coverage of taste nuance was poor; new genres or themes required schema changes.
- **Decision:** Replace with `text-embedding-3-small` 1536D embeddings, computed from a locked template (title, genres, overview, keywords, cast, runtime). User taste vector lives in the same space.
- **Consequences:** much higher fidelity; mood rooms become natural; HNSW dependency; per-title embedding cost (negligible at this catalogue size); coordinated regen needed if model deprecated.
- **Reference:** Strategy v1.6.3 §4.1, §5.2.

---

## ADR-005 — HDBSCAN runs in Python + GitHub Actions, not TypeScript

- **Status:** locked.
- **Context:** Mood Rooms require HDBSCAN clustering of the embedding space monthly. TypeScript HDBSCAN ports lack production-grade memory handling and parity with scikit-learn.
- **Decision:** Run clustering in Python with `hdbscan` package + `psycopg2` direct DB connection, scheduled monthly via GitHub Actions cron. No PL/Python on Supabase.
- **Consequences:** clean Python environment with pinned versions; reliable monthly cadence; one extra system to operate; secrets must live in both Supabase and GitHub Actions.
- **Reference:** Strategy v1.6.3 §5.2, parking lot IN-455 to IN-457.

---

## ADR-006 — `card_impressions` is a dedicated partitioned table, not a JSONB extension of `user_interactions`

- **Status:** locked, applied Phase 0.
- **Context:** Impression events are high-cardinality (every card shown). Putting them in `user_interactions.metadata jsonb` would balloon the table and slow every signal query.
- **Decision:** Dedicated `card_impressions` table with pg_partman monthly partitioning. Client batches and flushes impressions in groups. Daily rollup into `card_impression_daily_totals`.
- **Consequences:** clean separation of impression-scale data from low-frequency signals; partitioning means partition pruning makes queries fast; RLS replication to new partitions requires the event-trigger pattern (migrations 015 + 016).
- **Reference:** Detail Page Signal Capture Spec §5.1, parking lot IN-005, IN-007, IN-010, IN-011.

---

## ADR-007 — v1 archived as Git tag, not run in parallel

- **Status:** locked.
- **Context:** v2 is a substantial restructure. Standard rebuild patterns (parallel run, feature flags, cutover ceremony, dedicated cleanup phase) add complexity. Videx has only two prototype users; the cost of breaking changes is low.
- **Decision:** Tag current main as `v1-archive`, build v2 forward on `main` as a series of phase branches, delete v1 code in the phase that replaces it.
- **Consequences:** simpler branching; no feature-flag infrastructure; no Phase 6.5 cleanup phase; users re-onboard on v2; cleanup is continuous as a side effect of each phase.
- **Reference:** Project Orchestration v0.3.3 §1, §2.

---

## ADR-008 — Static genre mapping retained over populating `title_genres`

- **Status:** locked, applied Phase 0.5.
- **Context:** `title_genres` table exists (migration 001) but was never populated. Genre rows and filters worked fine via the static `GENRE_NAMES` constant in `lib/constants/genres.ts`.
- **Decision:** Do not backfill `title_genres`. Resolve title → genres via the static TMDb genre mapping plus the `genre_ids` already on `titles`.
- **Consequences:** simpler enrichment pipeline; `title_genres` remains as a future hook if multi-source genre data becomes useful; no per-title row explosion in a join table.
- **Reference:** Strategy v1.6.3 §4.0, parking lot IN-106.

---

## ADR-009 — `dismiss` event renamed to `not_interested`

- **Status:** locked, applied Phase 0.
- **Context:** v1 had two separate dismissal mechanisms: a `dismiss` event type in `user_interactions` and a localStorage dismissal list. Naming was confusing; "dismiss" suggested temporary hide rather than negative signal.
- **Decision:** Rename to `not_interested`. Rewrite `getDismissedIds()` to read from the unified event source. Migration 013 adds the new event type to the enum.
- **Consequences:** clearer semantics for users (button label) and engineers (event type); transitional code keeps v1 behaviour intact through Phases 1-3; localStorage dismissal list cleared on first launch of Phase 0 build.
- **Reference:** Strategy v1.6.3 §7.2, parking lot IN-007, IN-008.

---

## ADR-010 — pg_partman + monthly partitions for `card_impressions`

- **Status:** locked, applied Phase 0.
- **Context:** Impression cardinality is high. Without partitioning, queries against `card_impressions` would scan an ever-growing table.
- **Decision:** Use pg_partman with monthly range partitions (`card_impressions_pYYYY_MM`). Template partition seeds RLS; event trigger replicates RLS to new partitions automatically.
- **Consequences:** partition pruning keeps queries fast; old partitions can be detached/dropped for retention; RLS replication required two migrations to nail down (015, 016).
- **Reference:** Strategy v1.6.3 §6.4, parking lot IN-005.

---

## ADR-011 — Edge Function shared modules duplicated into `_shared/`

- **Status:** locked.
- **Context:** Supabase CLI cannot resolve TypeScript imports from outside `supabase/functions/` without Docker-based bundling, which is fragile on Windows and not always available locally.
- **Decision:** All shared code for Edge Functions lives in `supabase/functions/_shared/` as self-contained modules. Each function imports via `../_shared/`. Updates to shared code require redeploying every dependent function.
- **Consequences:** simpler deploys; some duplication of logic between `_shared/` and `src/lib/`; redeploy discipline required.
- **Reference:** parking lot IN-105.
