# Phase 4 — Document Corrections

Corrections to strategy documents collected during Phase 4 implementation.
Do NOT apply these mid-phase. Hand over at phase close-out for a batch update pass.

---

## Inherited from Phase 3 (pending)

1. **Strategy doc §5.2:** Bootstrap formula weights are now dynamic (4-band), not static 0.40/0.40/0.20
2. **Strategy doc §7.2:** Phase 3 scope now includes auth integration into onboarding
3. **Strategy doc §7.2:** Phase 5 line still references "catalogue-age slider wiring" — sliders are Phase 4 scope (resolved in Phase 4 brief)
4. **Orchestration doc §3.4:** Migrations 025 and 028 added (not originally planned)

## Phase 4 corrections

5. **Supabase client typing**: Adding `createClient<Database>` to `supabase.ts` exposes 47 pre-existing type mismatches across 6 files (supabaseStorage.ts, interactions.ts, analytics/logger.ts, reports/reportService.ts, taste-v2/bootstrap.ts, taste-v2/interactionUpdate.ts). Most are `string | null` passed to `.eq()` or `.insert()` where `string` is required, and `Record<string, unknown>` not assignable to `Json`. Deferred to Phase 5/6 cleanup. Phase 4 pipeline files handle typing via explicit result casts.
6. **`scoringMode: 'none'` in useSectionData.ts**: Remains in code. This is the TMDb API ordering path used by Home rows (Recently Added, Highest Rated, Trending) that fetch from TMDb discover endpoint. These are inherently ordered by a single sort key (date, rating, popularity) — not composed rows that should be pipeline-scored. The success criterion "zero grep hits for scoringMode: 'none' in composed-row code paths" is satisfied: all For You rows use the v2 pipeline, and the new Home rows (Per-Service Charts, Critically Acclaimed, Genre Spotlight) use Supabase-backed queries. The remaining useSectionData rows are acceptable exceptions.
7. **Coming Soon data source**: Verified that the `titles` table does NOT contain titles with future release dates (the sync pipeline only fetches released content). Coming Soon remains a TMDb API call via the existing `useUpcoming` hook, not Supabase-backed.
8. **`watched` vs `marked_watched` event type naming**: The `user_interactions` check constraint (migration 013) allows both `watched` and `marked_watched` as valid event types. However, `emitContentInteraction()` in `interactions.ts` emits `'watched'` (not `'marked_watched'`). The `InteractionEventType` type union does not include `'marked_watched'`. The check constraint should be cleaned up to remove `marked_watched` if it's never emitted, or the code should be aligned to use one name consistently.
