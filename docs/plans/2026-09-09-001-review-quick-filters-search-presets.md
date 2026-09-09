# Review: quick filters, presets, refine row (PRs #131–#142)

**Date:** 2026-09-09 · **Reviewed at:** `main` @ f702ebc (v2.3.0) · **Against:** [2026-09-08-002 recommendation](2026-09-08-002-recommendation-quick-filters-and-search-presets.md) · **Method:** four independent code reviews (one per session) reading the PR diffs and the code on main, plus cross-cutting checks and live-database verification by the reviewing session. Every finding below was re-verified in source before being listed.

## Verdict

The four sessions delivered what the plan asked, and the constraints that mattered most held: no new round trip on page open, no change to either KV cache key, no backfill from the raw pool, filtering downstream of fatigue and rotation, deletion and export untouched and verified live, the retention job correct and running. Documentaries are one predicate on both data paths with tests. The Browse screen is one intent that composes. The refine row refetches. Browse impressions exist for the first time.

Nine things should be fixed before the search work is considered closed. None blocks the gated v2.3.0 tracks. Three of them are the same defect wearing different clothes: **a later session wrote metadata that an earlier session's rule interprets as intent**, so refine chips can re-arm the taste boost the plan said they must never touch. The rest are small correctness gaps found by reading, not by testing.

## Should-fix (nine)

| # | Session | Where | What | Fix |
|---|---|---|---|---|
| 1 | 4 | `native/src/app/(tabs)/browse.tsx` refine-toggle log (l.357) | Refine rows carry `mood_key: intent.moodKey` in metadata and the typed text as the emit's `query` argument. `isContentIntentSearch` treats a `filter` row with a `mood_key` as intent, so **every chip tap while a preset is lit re-arms the 60 s 1.3× taste boost**. Typing keeps `moodKey`, so a chip on a typed grid boosts off a stale preset. The duplicated `query` is also aggregated a second time by the 079 rollup under `mode='filter'`. | Drop `mood_key` and `query` from refine-row metadata (keep `refine`, `on`, `filters`). Add a unit test asserting a refine row never satisfies `isContentIntentSearch`. Add a `refine` exclusion inside `isContentIntentSearch` as belt-and-braces. |
| 2 | 3 | `browse.tsx:174-186` | `describedRoute` is computed while Mode A is still fetching (`results === undefined` → `titleHit` null), so **the embed call fires for every settled query, including confident title hits**, and the "Reading that as a feeling" banner plus refine row flash before the title card replaces them. The title path does not wait on semantic (correct), but the wasted embed-query call is real cost and the flash is visible. | Gate `describedRoute` on `results !== undefined`. |
| 3 | 4 | `browse.tsx:190, ~388` | On a confident title hit the refine row is hidden but `applyBrowseFilters` still runs over "other matches", and *More filters* is inside the hidden row. Filters carried in from a preset silently thin the grid with no visible control. | Skip `applyBrowseFilters` on the title-hit route (the grid is "other matches", not a filtered set), or keep the row. |
| 4 | 4 | `browse.tsx:~616` | Zero-result copy names a chip to remove whenever a refine chip is active, before checking whether Mode A returned anything. Gibberish + *Newer* lit shows "try removing Newer". | Gate the refine copy on `tightened || !searching`. |
| 5 | 3 | `browse.tsx:~562` | `moodKey` is a single string overwritten by the last tap. Comfort then *Free to watch* runs Comfort's phrase but the banner reads *"Titles that feel like Free to watch"*. | Track the phrase-bearing preset separately from the last-tapped card, or derive the banner from `intent.phrase`. |
| 6 | 2 | `src/lib/server/foryouRender.ts:301-361` | `usedIds` now accumulates all 36 rendered ids from `recommendedForYou` and `hiddenGems`, and is passed to `buildOutsideYourUsual` and `fetchPaidTitlesScoped`. **Up to ~37 titles the user never sees unfiltered are now excluded from Outside Your Usual and New-to-rent-or-buy.** The unfiltered feed is not unchanged, contrary to the PR. | Add only the visible slice (first 20 / first 15) to `usedIds` for downstream rows; keep the full 36 for dedup between the two long rows only. |
| 7 | 2 | `src/lib/recommendations-v2/diversity.ts` via `ranker.ts:283` | `applyMMR` is O(k·n·selected) over 1536-d vectors; `k` went 20→36 and 15→36. "Bytes, not compute" is wrong; the extra work runs on every cold render and the 04:00 recompute. No CPU measurement in the PR. | Measure: `ForYouPayload.renderMs` already exists. Compare a week of Worker logs before and after 2026-09-09. If cold render moved materially, cap MMR at 20 and fill the tail by score. |
| 8 | 1 | `src/lib/featureFlags.ts:44-50` | `getFlag` calls `supabase.auth.getUser()` (a network round trip) **before** the cache lookup, so every settled query costs an auth request even for flag-off users — the "no network at all" claim is false. The memo has no TTL, so a flag turned off mid-session (consent revocation) keeps logging until restart. `useSearchLogging` also adds the dedupe key before the gate runs, so a query settled while the cached flag was off is permanently deduped for that mount. | Use `getSession()` (local) not `getUser()`; add a 10-minute TTL to the flag memo; check the gate before recording the dedupe key. |
| 9 | 2 | `src/hooks/useSearch.ts:110-112` | Web search still partitions on `item.type === 'doc'`, so web "Movies" excludes documentary films. The plan's instruction to replace every `=== 'doc'` branch was unconditional; the PR claimed it done. | Use `isDocumentary`/`contentMediaType` from `src/lib/content/documentary.ts`. Same for `src/App.tsx:479` (`'doc'` → `'movie'` for the detail route breaks TMDb-path doc series) and the native `PosterOverlays` "Doc" badge that only shows on the TMDb path. |

## Nits (fix opportunistically, in the same follow-up)

- Migration 079: cutoff `(now() - 30 days)::date` is session-timezone; `day` is UTC. Consistent only because pg_cron runs UTC. Use `(now() AT TIME ZONE 'UTC')::date`. The `ON CONFLICT … SET count = EXCLUDED.count` overwrites rather than adds; safe today because a day is consumed in one run, but a manual re-run over partially stripped data would clobber counts.
- Semantic refetch error path logs a `result_count: 0` row (`browse.tsx:~419`), polluting the zero-result tripwire. Skip the emit on error.
- Cost chip lit on the Mode A grid can be named as "the chip to remove" in the empty state although `applyBrowseFilters` ignores `cost` there.
- `presets.ts:283-291`: the "not last week" branch is dead — rotation alone produces different picks in consecutive weeks for bands ≥ 2, and a band of 1 returns the same key. Tests pass by rotation. Either delete the branch or make the test actually exercise it.
- Preset tap sets `text: ''` and `clearAll` leaves `text` alone. Both are documented deviations from "nothing clears anything else"; acceptable, but the plan §9.2 should say so.
- Two fixture entries ("something recent that isn't rubbish", "something I don't have to pay for") are never embedded by the app now that those cards are phrase-less; they are `gate:false`, harmless, but misleading.
- `src/components/ForYouPage.tsx:7` header still lists the retired mood refiner in its section order.
- For You's empty state requires `!view.hero`; New's does not. Inconsistent, not wrong.
- New's Documentaries chip shows the empty-state card for a moment, then swaps to the backfill rail when it lands. Deliberate; visible.
- `index.tsx:173` keys rails by display name; a spotlight cluster named like a service or a fixed rail would collide silently.
- Plan §5.2 says metadata `category`; code logs `route` after the Session 3/4 rework. §6's "split by category" metric should read `route`.
- `docs/legal/store-privacy-disclosures.md` lists fewer metadata keys than rows actually carry (full `filters` incl. services, `refine`/`on`, `selection_reason`, `rails_visible`/`items_visible`). All still "in-app search history"; the sheet is narrower than the truth, not wrong. Widen it before filing.
- Issue #137 auto-closed on merge before evidence existed. CI run 34340319500 later asserted the channel is in the v2.3.0 AAB, so the binary is proven; a device actually receiving an Android OTA is still unproven.
- `schema_migrations` has no row for 080 though the function is live. Known caveat; note it.

## Confirmed correct (the things the plan said must hold)

- `workers/api/src/foryouCache.ts` and `index.ts` untouched since f7cfc61. No new fetch on New or For You open; the Documentaries backfill is `enabled` only with the chip active, `staleTime: Infinity`, keyed on services. Neither screen reads `payload.pool`.
- Filtering runs client-side over rows already through fatigue, avoid-set and the ordering seed. Exploration slots and hero band sit inside the first 20.
- Quick-filter store is in-memory, per-surface, `useSyncExternalStore`; no persistence anywhere. Thin-rail 4, chip-visibility 8, active chip always renders.
- `isDocumentary` on genre 99 with tests over all three adapters, including an engine-path TV documentary. TV discover gets `with_genres=99`.
- `emitSearch` gate inside the emitter, default off, fails closed; attribution boost gated by `isContentIntentSearch` on both the emit path and the batch recompute (the batch filters in JS after fetching metadata, deliberately). Tests cover lookup, semantic+mood, filter+mood, bare filter, null mood_key, legacy no-mode.
- Settled-query logic: 1.5 s timer, emit requires text unchanged and results for that text, nonce-keyed intent rows, bidirectional reconciliation of held queries; 13 tests. The 300 ms debounce cannot log a prefix on submit.
- Migration 079: no user column, RLS enabled with no policies, insert-then-null in one `DO`, `jsonb_set` preserves other keys, idempotent, whole-day cutoff, 03:00 UTC after the 01:00 rollup and 02:00 partman jobs, no HTTP. Live: cron active, `search_terms_daily` exists.
- Policy: §2, §4, §7 sentences present as specified; Last updated 8 September 2026. 042/043/061 untouched; the aggregate's exemption is documented in the migration and the table comment.
- Presets: exactly eight, 4+4, each with sentence/phrase/filters/kind/clusters; four-slot selection with tests; *New & actually good* is phrase-less and runs discover with `vote_average.gte 7`, `vote_count.gte 50`, twelve-month window, identical flag on/off when no vibe phrase is running.
- `released` and `cost` axes on `BrowseFilters`; discover maps them to date bounds and `with_watch_monetization_types=flatrate|free|ads`; the semantic path handles `released` as a post-filter and `cost:'free'` through the new `subscription_included_titles` RPC (migration 080, `stream_type IN ('subscription','free')`, security invoker, fails open). IN-SL-002 is closed, not withheld.
- Title-hit confidence 0.55 on a blended title-match/prominence score, calibrated against the 16-entry fixture; the eval now applies the app's quality floor; precision@10 1.000 / MRR 0.900 on eight known titles gates the build.
- Refine row: five chips, one field each; every filter axis is in both query keys so a toggle refetches; runtime-unknown items are no longer failed by *Under 2h*; *Free to watch* withheld on the Mode A grid unless already lit; sheet and row in sync; `lastRefine` tracked with tests.
- Browse impressions recorded on all four routes; `TitleHitCard` records position 0 with `route: 'title'`. Live: 152 Browse impressions in the last 7 days where there were none before.
- Web mood refiner fully removed; web build, typecheck, eval and typegen checks green on #139.
- Android OTA channel written by `native/plugins/withUpdatesChannel.js` into the Gradle build, asserted by CI in the AAB.
- Live state (2026-09-09): 34 search rows from one user (filter 19, lookup 12, semantic 3); `search_logging` on for seven accounts by Joe's recorded decision, the store-review account permanently off.

## Decisions recorded by the sessions that this review accepts

- Enabling `search_logging` for the one third-party tester without the §10 notice, with the reasoning and the reopening condition written into the parking lot (IN-SL-003/004). The mitigations are real and verified. This review does not reopen it.
- Shipping v2.3.0 to gated tracks with the store privacy forms still unfiled, gated on v2.3.1. Correct sequencing; the forms remain the one hard gate on any public promotion.
- Holding the semantic flag to internal accounts until query understanding lands. Agreed; the eval data in #139 shows short typed sentences match on surface words.

## Engine follow-up (not a bug; sized here so it can be scheduled)

**Push `released` into the vector RPC.** `match_titles_by_vector` (migration 076) takes only the vector and a limit; `released` is a post-filter over 150 candidates, and *Newer* keeps 21 of them. A new migration adding `min_release_year integer DEFAULT NULL` to the function with one `AND` clause, threaded from `semanticCore.ts` through `runSemanticRetrieval`, is about 40 lines. Caveat: pgvector applies `WHERE` after the HNSW scan unless `hnsw.iterative_scan` is on (it is not set anywhere), so a 5%-selective predicate will still under-return; the 2× `ef` headroom helps but does not guarantee 150. Selective-filter recall needs iterative scan or a larger candidate count, and the index caps at 1,000.

## How to run the follow-ups

Two sessions, not four. Group by the code they touch, not by the session that wrote it.

**Follow-up A — Browse and logging correctness** (findings 1, 2, 3, 4, 5, 8 and the nits that live in `browse.tsx`, `useSearchLogging.ts`, `featureFlags.ts`, 079's timezone, the disclosure doc, the fixture, the plan-text drift). One PR.

**Follow-up B — Engine and web** (findings 6, 7, 9; the `released` push-down if Joe wants it now; the `renderMs` measurement). One PR, with `eval:eng1` and `eval:novelty` re-run and pasted.

Handoff prompts are in [2026-09-09-002](2026-09-09-002-handoffs-search-followups.md).
