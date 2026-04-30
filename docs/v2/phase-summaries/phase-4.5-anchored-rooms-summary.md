# Phase 4.5 (redirect) Summary: Title-Anchored Mood Rooms

**Branch:** `phase-4.5-mood-rooms`
**Duration:** 2026-04-27 (single-session redirect on top of the Gates 1–4 work that landed 2026-04-19 → 2026-04-22)
**Predecessors:**
- Diagnostic: [Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md](../Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md)
- Probe: [Mood_Rooms_Anchored_Probe_2026_04_26.md](../Mood_Rooms_Anchored_Probe_2026_04_26.md)
- Kick-off: Phase 4 Title-Anchored Mood Rooms kick-off (April 2026, in-conversation brief)

This phase redirects the For You "Mood Rooms for Tonight" row from global cosine-distance ranking to title-anchored generation. The global rooms infrastructure (tables, RPCs, monthly clustering job) is unchanged and reserved for v2.5 browse + Phase 7 conversational discovery.

---

## What was built

### Migration

- **033** (`033_card_impressions_anchor_room_metadata.sql`): two changes in one DDL.
  - Extended `card_impressions.source_surface` CHECK constraint with `'anchor_room'` so per-row CTR distinguishes anchored from global mood-room engagement at the column level.
  - Added `card_impressions.metadata jsonb` (nullable) for per-impression surface-specific context. Anchored rooms emit `{ anchor_tmdb_id, anchor_media_type, anchor_tier, anchor_source_cluster_id, tier_1_inside_stated_cluster }`.
  - No GIN index on `metadata` — the analytics query pattern is `WHERE source_surface = 'anchor_room' THEN metadata->>'anchor_tier'`, which the existing `source_surface` index already accelerates.

### Code (8 new + 5 updated)

New:
- `src/lib/recommendations-v2/anchorSelection.ts` — Tier 1/2/3 ladder, three Tier 1 guards (combined-signal, similarity gate, cluster-coherence), cross-tier collision rule. Tunable thresholds in a constants block at the top of the file.
- `src/lib/recommendations-v2/anchoredRoom.ts` — `buildAnchoredRoom(opts)`. The reusable room-generation primitive (kick-off §1.6). Exports `BuildAnchoredRoomOptions` and `BuildAnchoredRoomResult`.
- `src/hooks/useAnchorMoodRooms.ts` — produces 5 anchored rooms per user per week. Anchor selections cached in localStorage by `(userId, weekBucket)`. `featuredLastWeek` exclusion. Per-anchor latency captured and surfaced via `perAnchorLatencyMs`.
- `src/components/AnchorMoodRoomCard.tsx` — 200×280 frame, 2×2 thumbnail grid, "If you love {anchor}" label.
- `src/components/AnchorMoodRoomsRow.tsx` — horizontal scroll, scroll preservation key `'foryou-anchor-rooms'`.
- `supabase/migrations/033_card_impressions_anchor_room_metadata.sql`.
- `docs/v2/phase-summaries/phase-4.5-anchored-rooms-summary.md` (this file).
- New parking-lot entries (IN-463, IN-464, IN-465, IN-OB-006).

Updated:
- `src/lib/recommendations-v2/ranker.ts` — removed `fetchAnchorNeighbours`; the BYW callsite now uses `buildAnchoredRoom`.
- `src/lib/recommendations-v2/hardFilters.ts` — added `applyAnchorHardFilters(titles, filterSets, { excludeWatchlist })`. Anchored mood rooms set `excludeWatchlist: false` (a watchlisted title belongs in its neighbourhood); BYW keeps the default `true`.
- `src/lib/instrumentation/impressionBatcher.ts` — `ImpressionSurface` gained `'anchor_room'`; `RecordImpressionInput` gained an optional `metadata: Record<string, unknown> | null`. Threaded through to the buffered insert.
- `src/components/MoodRoomPage.tsx` — parameterised with discriminated union `kind: 'global' | 'anchor'` plus a swappable detail-fetcher. Impression batching, scroll preservation, pagination logic stay shared. Anchored impressions stamp `source_surface='anchor_room'` + the metadata payload.
- `src/components/ForYouPage.tsx` — replaced `<MoodRoomsRow>` with `<AnchorMoodRoomsRow>`. Threads `useForYouContent`'s candidate pool into `useAnchorMoodRooms` so Tier 3 can run without a second 500-candidate RPC.
- `src/hooks/useForYouContent.ts` — exposes `pool: CandidatePool | null` on the result; switched BYW to `buildAnchoredRoom`.
- `src/lib/taste-v2/types.ts` and `tasteProfileV2.ts` — `getV2TasteProfile()` now reads `selected_clusters` (one read instead of two for the For You + anchored hooks).
- `src/App.tsx` — replaced `selectedMoodRoomId` state with `selectedAnchorRoom: AnchorRoomPreview | null`; updated tab-change reset, back-button hierarchy, scroll-restore deps, and the JSX render branch to consume the new state.

Deleted (dead code per CLAUDE.md):
- `src/hooks/useMoodRoomsRow.ts`
- `src/components/MoodRoomsRow.tsx`
- `src/components/MoodRoomCard.tsx`

The global-rooms-on-For-You row's specific consumers were no longer reachable after the redirect. The `MoodRoomPage` parameterisation (`kind: 'global'`) is preserved as the durable artefact v2.5 will consume.

### Documentation

- **Strategy v1.7** (renamed from v1.6.3): new §5.2.1 anchored ranking layer subsection; §9.3 commits item 17 amended; new item 17a covering the reusable primitive; §8.2 new open question on guard threshold calibration.
- **Project Orchestration v0.4** (renamed from v0.3.3): §3.4 Phase 4.5 description rewritten + migration 033 row added; §11 Confirmed Decisions amended.
- **Composition Hypothesis v0.4** (renamed from v0.3): §3.2 row 2 rewritten as title-anchored; §3.6 v2.5 browse confirmed to use the global rooms.
- **Parking Lot v0.4** (renamed from v0.3.4): IN-463 (LLM labels), IN-464 (detail-page room generator), IN-465 (catalogue-sync gap), IN-OB-006 (onboarding cluster taxonomy review).
- **Diagnostic doc closure**: resolution-path footer added to `Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md` with pointers to all the bumped docs and a correction of the probe report's "79.2%" coverage framing.
- **Wiki**: `videx-wiki/wiki/concepts/architecture/mood-rooms.md` and `for-you-surface.md` updated with the anchored ranking layer section.

---

## Decisions made during execution

| Decision | Chosen | Why |
|---|---|---|
| Migration 033 shape | Single migration: extend CHECK + add `metadata jsonb` | The two changes ship for the same row (anchored mood rooms instrumentation) and propagate the same way. One DDL is cleaner and reduces the migration sequence by one. |
| `metadata` column shape | Generic, nullable, no CHECK on shape | Makes the column reusable for future surfaces without another migration. Existing inserts pass NULL implicitly. |
| Watchlist exclusion in anchored rooms | Off (`excludeWatchlist: false`) | Brief §1.4 step 5 listed only `dismissed`, `thumbs_down`, `not_interested` as exclusions. Anchored rooms are about the neighbourhood as a place — a shortlisted title belongs alongside its neighbours. BYW keeps the exclusion since that row is "more like X you haven't shortlisted yet". |
| Parking-lot IDs | IN-463 / IN-464 / IN-465 / IN-OB-006 | The brief assumed IN-455/IN-456 as next-available; both were already taken by Phase 4.5 Gates 1–4 entries. Used next free IDs. |
| Pool sharing for Tier 3 | `useForYouContent` exposes its `CandidatePool` via React state; `useAnchorMoodRooms` consumes it | Avoids a second 500-candidate RPC. If the pool isn't ready (cold start), Tier 3 simply doesn't run and the row may show < 5 anchors — acceptable per brief. |
| Refactoring the BYW row | Migrated to `buildAnchoredRoom` | Single primitive, two callsites. Simpler than maintaining two near-duplicate functions. The shared `applyAnchorHardFilters` with the watchlist toggle keeps both surfaces correct. |
| Cleanup of legacy For You-only consumers | Deleted `useMoodRoomsRow`, `MoodRoomsRow`, `MoodRoomCard` | Dead code per CLAUDE.md. The `MoodRoomPage` `kind: 'global'` interface is preserved for v2.5. |

---

## Deviations from the brief

1. **Doc version bumps started from current actuals**, not from the versions named in the brief. Strategy v1.6.3 → v1.7 (brief said v1.6.2 → v1.7). Orchestration v0.3.3 → v0.4. Parking lot v0.3.4 → v0.4. No semantic difference; the spirit of each bump is preserved.

2. **Parking-lot IDs renumbered**. IN-455 / IN-456 were already in use; the new entries are IN-463 / IN-464 / IN-465 / IN-OB-006.

3. **The keyword-less backfill investigation produced a different result than the brief anticipated.** The probe report's "79.2% on-service embedding coverage" framing is misdiagnosed. The whole `titles` table is effectively 100% embedded (20,109 / 20,116; the 7 missing rows are TMDb-deleted stubs). The 21% gap is **3,807 tmdb_ids that appear in `streaming_availability` but are absent from `titles` entirely** — heavily Prime-skewed, outside the discover-sweep coverage. This is a content-sync gap, not an embedding gap. Filed as IN-465 for follow-up. The diagnostic doc closure carries the correction.

4. **`fetchAnchorNeighbours` deleted, not aliased.** The brief's §1.6 framing suggested keeping the existing function as a primitive. Discovery during implementation showed the function had only one caller (Because You Watched), so refactoring into a single shared primitive (`buildAnchoredRoom`) was simpler than maintaining two near-duplicates.

5. **`source_surface='anchor_room'` chosen over a metadata-only disambiguation.** The brief offered the trade-off in §2.1. The dedicated source_surface value plus the metadata column gives clean indexable per-row CTR analytics without forcing analytics queries to inspect jsonb to disambiguate row types.

---

## Telemetry status

**Instrumentation hooks live, awaiting first user data.**

- `recordImpression()` accepts and persists `metadata` (impressionBatcher + table column both wired).
- `MoodRoomPage` for `kind='anchor'` stamps `source_surface='anchor_room'` and the full anchor metadata payload on every visible-card impression.
- The hook surfaces `perAnchorLatencyMs: number[]` per render so we can read production wallclock numbers from console / runtime.

**No first-day-of-data observations yet** — this redirect landed in a single session and the migration is still ⏳ Planned in the orchestration doc; production rollout is the next step. When migration 033 is applied and the build deploys, the per-tier CTR data will accumulate from session 1.

**Latency expectation.** Probe measured 2.5–3.7s per `match_titles_by_vector` over residential WAN (Section 5 of the probe report). Production server-side per-call expected at 50–300ms; with `Promise.all` parallelisation across 5 anchors, wallclock should be ~max-of-set. **The first-deploy latency reading should be captured and added to this summary** — it's the empirical proof that the design lands within the user-perceived "instant" budget.

---

## New parking-lot items surfaced during implementation

- **IN-465 (catalogue-sync gap)** — surfaced by the keyword-less backfill investigation. The probe report's "79.2% coverage" framing is wrong; the actual issue is 3,807 missing `titles` rows. Not a Phase 4.5 blocker (anchored rooms ship cleanly at current coverage); silently underweights the missing subset for both anchored and any future global ranking strategy.

No other unexpected items surfaced during implementation. The brief's three explicit follow-ups (IN-463, IN-464, IN-OB-006) all filed as planned.

---

## Verification

- `npx tsc --noEmit`: clean (0 errors).
- `npx vite build`: succeeds in ~3.4s. Bundle size warning unchanged from Phase 4 baseline (519kB → 519kB main chunk).
- Migration 033 written; not yet applied to production. Pre-deploy: smoke-test the schema change against a Supabase branch.
- No `lint` run yet (eslint passed in Phase 4 with 159 pre-existing warnings; this redirect should not add new warnings — verify before push).
- Manual UI smoke: not yet run. The user will test against the deployed build; first-pass concerns to watch for are listed in the kick-off §7.

---

## Documents updated

- `docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md` → `v1.7.md` (renamed via `git mv` to preserve history; content amended)
- `docs/v2/Videx_v2_Project_Orchestration_v0.3.3.md` → `v0.4.md`
- `docs/v2/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md` → `v0.4.md`
- `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md` → `v0.4.md`
- `docs/v2/Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md` (closing footer added)
- `videx-wiki/wiki/concepts/architecture/mood-rooms.md` (anchored ranking section added)
- `videx-wiki/wiki/concepts/architecture/for-you-surface.md` (row 2 updated)

Wiki `raw/` source mirrors are NOT updated in this phase — the `raw/` directory is a static snapshot taken from Joe's pen; mid-phase amendments are recorded in the live wiki concepts and will flow into the next pen-side snapshot at his cadence.

---

## What this enables next

- **IN-463 (Phase 4.5 fast-follow)** can now ship: the anchored row is live; replacing the literal labels with thematic LLM-generated ones is a self-contained Edge Function + label-cache project.
- **IN-464 (Phase 6+)** is unblocked: the room-generation primitive is in `src/lib/recommendations-v2/anchoredRoom.ts` ready to be called from the detail page.
- **IN-OB-006 (Phase 6 review)** has its data source: 3 months of `card_impressions.metadata` with `anchor_tier` / `anchor_source_cluster_id` / `tier_1_inside_stated_cluster` will tell us which clusters are pulling weight and whether onboarding Step 4 should be sharpened, dropped, or hybridised.
- **The diagnostic from April 22 is closed.** A future surface that wants to do "rooms like X" (detail page, conversational discovery) can call the same primitive without fork.
