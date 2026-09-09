# Handoffs: search follow-ups A and B

**Date:** 2026-09-09 · **Source:** [2026-09-09-001 review](2026-09-09-001-review-quick-filters-search-presets.md) · Run A first; B is independent of A but touches the same wiki pages, so merge A before opening B's PR.

## Follow-up A — Browse and logging correctness

```
Context: Videx native app (native/, Expo) + shared src/lib. Fix the Browse/search correctness findings from docs/plans/2026-09-09-001-review-quick-filters-search-presets.md — read its "Should-fix" table (items 1, 2, 3, 4, 5, 8) and the "Nits" list first. Every item cites file:line on main @ f702ebc. Do NOT touch src/lib/server/foryouRender.ts, the recommender, or web search (those are Follow-up B).

Worktree branch off main; relative paths; native/src/lib is a symlink to src/lib — never recursive-delete inside native/.

1. Refine rows must never earn the taste boost. In native/src/app/(tabs)/browse.tsx (refine toggle emit, ~l.357) drop mood_key from the metadata and pass an empty string as the query argument; keep refine/on/filters. In src/lib/taste-v2/searchAttribution.ts add an explicit exclusion: a filter-mode row whose metadata has a `refine` key is never content intent. Add unit tests: (a) refine row with mood_key present → not intent; (b) preset tap with mood_key → intent; (c) the 079 rollup does not see typed text on refine rows (query null).
2. browse.tsx ~l.174-186: gate describedRoute on `results !== undefined` so the embed call never fires while Mode A is pending and the described layout never flashes before a title hit. Verify with the network log that typing "severance" makes zero embed-query calls.
3. browse.tsx ~l.388: on the title-hit route do not run applyBrowseFilters over "other matches" (the row and the sheet are hidden there, so no filter may act). Alternatively keep the row visible; pick one and say why in the PR.
4. browse.tsx ~l.616: the refine-chip empty-state copy may only render when results existed before filtering (`tightened`) or when not searching. Gibberish + a lit chip must show the plain "nothing found" copy.
5. browse.tsx ~l.562: the "Titles that feel like …" banner must name the preset whose phrase is running, not the last-tapped card. Derive it from intent.phrase (store the phrase-bearing preset key alongside moodKey, or look the phrase up in the pool).
6. src/lib/featureFlags.ts: replace supabase.auth.getUser() with getSession() (no network); add a 10-minute TTL to the memo; native/src/hooks/useSearchLogging.ts: run the flag gate before recording the dedupe key so a query settled while the flag was off is not permanently deduped. Add a test for the TTL.
7. Nits in scope: skip the emit on the semantic error path (browse.tsx ~l.419) instead of logging result_count 0; never name the cost chip as "the chip to remove" on the Mode A grid; delete or genuinely test the dead "not last week" branch in src/lib/content/presets.ts ~l.283-291; migration 081 fixing 079's cutoff to `(now() AT TIME ZONE 'UTC')::date` (verify live with to_regclass/cron.job first — remote schema_migrations is not authoritative); remove the two unreachable phrase-less fixture entries or mark them clearly; fix the ForYouPage.tsx header comment; widen docs/legal/store-privacy-disclosures.md to list every metadata key rows actually carry (filters incl. services, refine/on, selection_reason, rails_visible/items_visible); update the plan's §5.2/§6 wording from `category` to `route`; note in the plan §9.2 that a preset tap clears text and clearAll leaves it.
8. Verify on device (iOS is fine): the five acceptance cases in the review's items 1–5, plus the flag-off user makes no network call per settled query. Run `npm test` at root and `npx tsc --noEmit` in native/.
9. Wiki from the same worktree: phase-search-v2.md (attribution rule now excludes refine rows), signal-architecture.md, log.md; parking-lot: record the fixes against the items they close.
```

## Follow-up B — Engine and web

```
Context: Videx shared engine (src/lib/server, src/lib/recommendations-v2) + web app (src/). Fix the engine/web findings from docs/plans/2026-09-09-001-review-quick-filters-search-presets.md — read "Should-fix" items 6, 7, 9 and the "Engine follow-up" section first. Every item cites file:line on main @ f702ebc. Do NOT touch native/src/app/(tabs)/browse.tsx or the logging hooks (Follow-up A).

Worktree branch off main; relative paths; native/src/lib is a symlink to src/lib — never recursive-delete inside native/.

1. src/lib/server/foryouRender.ts ~l.301-361: the unfiltered For You composition must be unchanged by the 36-row render. Add only the VISIBLE slice (first 20 of recommendedForYou, first 15 of hiddenGems) to the usedIds passed to buildOutsideYourUsual and fetchPaidTitlesScoped; keep the full 36 for dedup between the two long rows themselves. Add a unit test in src/lib/server/__tests__ that a title in the reserve tail is still eligible for Outside Your Usual. Re-run npm run eval:eng1 and eval:novelty and paste both summaries.
2. Measure the MMR cost of k=36. ForYouPayload.renderMs already exists: pull a week of Worker logs either side of 2026-09-09 (wrangler tail or the Cloudflare dashboard) and report p50/p95 cold-render renderMs before and after. If p95 rose materially, cap applyMMR at k=20 in src/lib/recommendations-v2/ranker.ts ~l.283 and fill positions 21–36 by score with the genre spread applied; otherwise record the numbers in the PR and leave it.
3. Web documentaries: src/hooks/useSearch.ts ~l.110-112 and src/App.tsx ~l.479 still branch on `type === 'doc'`; native/src/components/PosterOverlays.tsx ~l.70 shows the "Doc" badge only on the TMDb path. Replace all three with isDocumentary/contentMediaType from src/lib/content/documentary.ts. grep for any remaining `'doc'` comparisons in src/ and native/src and list them in the PR. `npm run build` must pass.
4. Optional, do only if Joe says yes in the session opener: push `released` into the vector RPC. New migration re-creating match_titles_by_vector (see migration 076) with `min_release_year integer DEFAULT NULL` and one AND clause; thread from src/lib/recommendations-v2/search/semanticCore.ts through runSemanticRetrieval; keep the post-filter as a no-op safety. State the HNSW post-filter caveat (no hnsw.iterative_scan set; selective predicates under-return) in the migration comment and measure Newer's survivor count before/after with the eval rig.
5. Wiki from the same worktree: for-you-surface.md (usedIds rule, MMR measurement), phase-search-v2.md if item 4 lands, log.md.
```
