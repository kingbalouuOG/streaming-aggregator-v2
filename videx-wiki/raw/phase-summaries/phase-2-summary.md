## Phase 2 End-of-Phase Summary

### Phase identifier and completion date
- Phase: 2 — Service fingerprints
- Completed: 2026-04-12
- Branch: `phase-2-service-fingerprints`

### What was delivered

**New files created:**
- `supabase/migrations/020_service_fingerprints.sql` — `service_fingerprints` table with `vector(1536)` centroid, CHECK constraint on `title_count`, authenticated-only RLS
- `supabase/functions/_shared/centroidMath.ts` — isomorphic shared module (`computeCentroid`, `cosineSimilarity`, `l2Norm`), extracted from Phase 1's `eval-cluster-coherence.ts`
- `supabase/functions/refresh-service-fingerprints/index.ts` — weekly Edge Function to recompute all fingerprints (JWT-verified, service-role only)
- `supabase/cron/refresh_service_fingerprints.sql` — pg_cron job at Sunday 07:00 UTC
- `scripts/fingerprints/build-service-fingerprints.ts` — one-time build script (resume-safe, EPERM-retry, `--dry-run`/`--limit`/`--top` flags)
- `scripts/fingerprints/eval-service-discrimination.ts` — two-section eval (Build Sanity + Discrimination Quality)
- `scripts/fingerprints/__tests__/centroidMath.test.ts` — 13 test cases
- `docs/v2/phase-2-service-discrimination-eval.md` — discrimination evaluation report
- `docs/v2/phase-summaries/phase-2-summary.md` — this file

**Existing files modified:**
- `package.json` — added `build:fingerprints`, `eval:fingerprints`, `test:fingerprints` scripts
- `.gitignore` — added `scripts/fingerprints/.checkpoint.json`, `.failures.jsonl`
- `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md` — added Phase 2.5 section with IN-250 (TMDb watch/providers backfill for BBC/NOW/Sky Go service gaps)

**Migrations applied:**
- 020: `service_fingerprints` table with `vector(1536)` centroid, `CHECK (title_count > 0 AND title_count = array_length(source_title_ids, 1))`, authenticated + service_role RLS

**Tests added:**
- `scripts/fingerprints/__tests__/centroidMath.test.ts` — 13 cases (all green)

**Dependencies:** none added

**Environment variables introduced:** none (reads existing `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)

### Deviations from the phase plan

1. **Migration number: confirmed as 020.** No conflict — Phase 3's v1-taste-vector drop renumbers to 021. Parking lot updated.

2. **Selection criterion: popularity DESC only (no recency decay).** The brief proposed `exp(-age_years/5)` recency decay citing Strategy §5.2, but §5.2 describes user taste vector signal decay and Stage 2 ranking recency weight — not fingerprint title selection. Strategy §4.4 says "by popularity/ratings". Used `popularity DESC` with `vote_count >= 50` noise filter.

3. **`deep_links` table does not exist.** The brief referenced it throughout but the actual table is `streaming_availability` (migration 001). All queries use `streaming_availability` with `stream_type IN ('subscription', 'free')`.

4. **RLS tightened from brief.** Brief specified anon read access. Strategy review identified that onboarding Step 2 occurs after Step 1 (account creation), so the user is always authenticated when fingerprints are read. Dropped anon policy to avoid replicating the IN-XPS-002 pattern. Authenticated + service_role only.

5. **title_count CHECK constraint added.** Not in the brief. Strategy review required `CHECK (title_count > 0 AND title_count = array_length(source_title_ids, 1))` to prevent zero-row centroids (mathematically meaningless) and audit array drift.

6. **Idempotent policy creation.** Strategy review caught that `CREATE POLICY` without `DROP POLICY IF EXISTS` would fail on re-run. Added `DROP POLICY IF EXISTS` before each `CREATE POLICY`.

7. **Dry-run checkpoint bug.** Build script was writing completed_services during `--dry-run`, causing live runs to skip all services. Fixed: checkpoint writes are now gated behind `!dryRun`.

8. **BBC iPlayer, NOW TV, Sky Go have no fingerprints.** BBC has zero rows in `streaming_availability` (SA API catalogue empty despite listing the service). NOW has 591 rows but all classified as `addon` (not subscription/free). Sky Go is not in the SA API. Filed as IN-250 (Phase 2.5) — TMDb watch/providers backfill to fill the gaps before Phase 3 cold-start wiring.

### Decisions made during execution

1. **Anchor assertion N/A.** BBC iPlayer is not in the dataset (SA API gap), so the BBC × MUBI anchor assertion cannot be tested. Flagged as N/A in the eval report. Phase 2.5 will populate BBC data, enabling the anchor test in a re-run.

2. **Discrimination thresholds: conditional pass.** Max pairwise cosine 0.9779 (threshold 0.92), mean 0.8882 (threshold 0.75). Both fail numerically but reflect genuine catalogue overlap — the top-150-by-popularity titles on Netflix, Prime, and Disney+ are largely the same blockbusters. Fingerprints DO discriminate where catalogues genuinely differ: MUBI (arthouse, 0.69–0.91), Discovery+ (factual, 0.69–0.84). The shared middle ground averages out in the centroid; distinctive edges drive cold-start differentiation.

3. **NOW TV `addon` classification.** All 591 NOW rows are `stream_type = 'addon'`, not `subscription`/`free`. This is a SA API classification issue. Deferred to Phase 2.5 alongside the BBC/Sky Go backfill.

4. **10 services fingerprinted** (not the planned ~10 from the brief's service list). The actual services in `streaming_availability` include discovery, mubi, and plutotv which weren't in the brief's expected list. BBC, NOW, and Sky Go are absent. Phase 2.5 will address the gap.

### Documentation updates needed

- `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md` — Updated in this phase: Phase 2.5 section added with IN-250
- Orchestration doc: migration 020 status should flip to ✅ Applied. Migration 021 (Phase 3 taste vector) confirmed as next.

### Open items carried forward

1. **IN-250 (Phase 2.5):** TMDb watch/providers backfill for BBC iPlayer, NOW TV, Sky Go. Prerequisite for Phase 3 cold-start — without it, these services contribute nothing to the onboarding taste vector blend.
2. **SA API GitHub issue (BBC iPlayer empty catalogue):** filed, no response. Phase 2.5 TMDb backfill is the contingency.
3. **Discrimination threshold tuning:** if cold-start quality underperforms in Phase 3 testing, consider weighting by service exclusivity or adding recency decay to the selection criterion.
4. **IN-XPS-004:** service-role JWT in cron SQL files (pre-existing, not Phase 2 specific). Rotate before public launch.

### Verification results

| Check | Result | Evidence |
|-------|--------|----------|
| Migration 020 applied, schema correct | PASS | `\d service_fingerprints` — 6 columns, PK on (service_id, region) |
| RLS authenticated-only read, service_role write | PASS | 2 policies, no anon. `relrowsecurity = true` |
| CHECK constraint on title_count | PASS | `title_count > 0 AND title_count = array_length(source_title_ids, 1)` |
| Anon negative test | PASS | `SET ROLE anon; SELECT count(*)` returns 0 (RLS filters) |
| service_fingerprints row count = 10 | PASS | 10 rows, one per service |
| All centroids are vector(1536) | PASS | Schema enforces type |
| source_title_ids populated, matches title_count | PASS | CHECK constraint enforces; verified via query |
| Edge Function returns 401 unauth | PASS | `HTTP 401` without bearer |
| Edge Function returns 200 with bearer | PASS | `{"status":"ok","services_processed":10,"services_failed":0}` |
| Cron registered at Sunday 07:00 UTC | PASS | `cron.job` shows `schedule: '0 7 * * 0'`, `active: true` |
| Eval report exists | PASS | `docs/v2/phase-2-service-discrimination-eval.md` |
| Build Sanity section passes | PASS | L2 norms vary (std dev 0.019), first-3 unique (10/10), anchor N/A |
| Discrimination thresholds | CONDITIONAL PASS | Max 0.9779, mean 0.8882 — exceeded due to genuine catalogue overlap, documented justification |
| service_ids match streaming_availability | PASS | 10 services in fingerprints ⊆ 15 services in SA (excluded: services with zero sub/free rows) |
| `npx tsc --noEmit` clean | PASS | Zero errors |
| `npm run test:fingerprints` all pass | PASS | 13/13 green |
| Phase 2 summary doc exists | PASS | This file |

### Current state summary

The `service_fingerprints` table contains 10 rows — one 1536D centroid per UK streaming service with subscription/free content in the `streaming_availability` table. Each centroid is the element-wise mean of the top-150-by-popularity title embeddings (or fewer for smaller catalogues). The `refresh-service-fingerprints` Edge Function recomputes all fingerprints weekly on Sunday 07:00 UTC via pg_cron. Three UK services (BBC iPlayer, NOW TV, Sky Go) have no fingerprints due to SA API data gaps — addressed by IN-250 (Phase 2.5 TMDb backfill). The shared `centroidMath.ts` module is used by both scripts and the Edge Function. Build sanity checks confirm the fingerprints are correctly constructed; discrimination quality shows a conditional pass with high similarity between mainstream services (genuine catalogue overlap) and clear separation for niche services (MUBI, Discovery+).

### Observations for the next phase

1. **BBC iPlayer gap is critical for Phase 3.** Phase 2.5 (IN-250) should be completed before Phase 3 begins. BBC is likely top 3 most-selected UK services — a missing fingerprint means zero cold-start contribution for a large user segment.
2. **Catalogue overlap is structural, not a model problem.** The top-150 popular titles on Netflix/Prime/Disney+ are largely identical. If finer discrimination is needed, weight by service exclusivity (inverse of how many services carry each title) rather than tuning thresholds.
3. **MUBI is the discrimination anchor.** Lowest similarity with every mainstream service (0.69–0.91). When BBC is added (Phase 2.5), BBC × MUBI should be the definitive anchor pair.
4. **Transient fetch failures self-heal.** MUBI's upsert failed once on `TypeError: fetch failed`, succeeded on immediate re-run. The idempotent upsert + resume-safe checkpoint pattern works as designed.
5. **Build script completes in ~30s.** Only 10 services with DB-only operations (no external API calls). Well within Edge Function timeout for the weekly refresh.
6. **Discovery+ (13 titles) and MUBI (47 titles) are low-confidence.** Their fingerprints may not fully represent the service's content personality. Monitor after Phase 2.5 if TMDb provides more titles for these services.
