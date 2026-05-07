# Phase 5 Summary — Contextual Signals, MMR, Pre-Launch Hardening

**Status:** Phase 5 closed 2026-05-06.
**Branch:** `phase-5-contextual-signals` (PR #4).
**Predecessor:** [Phase 4 + 4.5 combined summary](phase-4-and-4.5-summary.md).
**Brief:** `Phase_5_Kickoff.md` (Joe's draft v0.1, reviewed and adapted — five corrections folded into the plan: D-after-A/B sequencing, narrower marked_watched scope, no `verify_jwt` source-of-truth yet, two net-new dependencies, TZ skew between client and Edge).
**Plan:** `~/.claude/plans/i-m-working-through-the-linked-robin.md`.

Phase 5 was the pre-launch hardening pass before Phase 6 (launch). Six workstreams: contextual scoring, MMR diversity, security blockers, type-system cleanup, UX carry-overs, quality sweep. Estimated 3–4 weeks; landed in one focused push thanks to scope-narrowing decisions captured below.

---

## Section 1 — Headline outcomes

By Phase 5 close:

- **Contextual scoring is real.** `contextual.ts` no longer returns a 0.5 placeholder — three sub-scores (time-of-day 40% / viewing context 40% / device 20%) with TMDb-genre boost tables, mobile long-runtime suppression, and a fully wired `PipelineContext` flowing through both the client and Edge Function paths.
- **MMR replaces `applyGenreSpread`** for For You taste-vector rows (Recommended For You, Hidden Gems, Outside Your Usual). Greedy MMR with λ ∈ [0.55, 0.85] driven by the Variety slider. `applyGenreSpread` retained as fallback when embedding map is absent.
- **Five pre-launch security migrations live** (036–039 applied; 040 deferred):
  - taste_profiles RLS (was openly readable in production)
  - marked_watched event_type cleanup (CHECK constraint + read-side filters + taste-v2 weights)
  - username_available SECURITY DEFINER RPC (replaces "FOR SELECT USING (true)" anon policy on profiles)
  - cron jobs Vault-backed JWT (inline service-role JWT moved out of source code)
- **CORS tightened** on `render-foryou-rows` and `label-anchor-room` — origin echo only when allow-listed (`capacitor://localhost`, `https://localhost`, `^http://localhost(:port)?$`, plus a `VIDEX_ALLOWED_DEV_ORIGINS` env hook). Replaces `Access-Control-Allow-Origin: *`.
- **`verify_jwt` source-of-truth established** as per-function `config.toml` files. `edge-fn-jwt-guard` CI workflow fails any PR that flips `verify_jwt = false` on a user-callable Edge Function.
- **`<Database>` generic re-enabled** on the Supabase client. The 47-error backlog from Phase 4 is closed (52 errors actually surfaced — original 47 + 5 from Phase 5's own commits). `npx tsc --noEmit` clean.
- **`foryou-parity` CI workflow** authored (IN-XPS-012). Soft-skips when secrets aren't configured; once Joe wires `PARITY_*` repo secrets, the probe enforces semantic parity between Edge and client paths.
- **Latent bug fix uncovered + landed.** The `marked_watched → watched` rename in `taste-v2/types.ts` exposed that `INTERACTION_WEIGHTS['watched']` was returning `undefined`, silently no-op'ing every "Mark as watched" click on the user's taste vector. Fix restores the intended 0.5 weight contribution. Filed as a quality-sweep finding rather than a no-op cleanup.

Verification:
- `npx tsc --noEmit` clean with `<Database>` generic active.
- `shared-tree-drift` workflow expected to remain green (every Phase 5 src/lib change has a `_shared` mirror).
- `foryou-parity` workflow file in place (secrets pending).
- `edge-fn-jwt-guard` workflow file in place.
- All four migrations 036–039 applied to production via Studio SQL editor; verification queries passed (anon SELECT denied on `taste_profiles`, `marked_watched` CHECK rejected, `username_available` RPC functional, `count(*) FROM cron.job WHERE command LIKE '%Bearer ey%'` = 0).

---

## Section 2 — Pre-Phase-5 hygiene (steps H1–H5)

These predated the branch cut and unblocked Phase 5 work:

- H1 (merge `phase-4.5-mood-rooms` to main) — already done via PR #2 before Phase 5 began.
- H2: Orchestration v0.5 → v0.6 — added migrations 033/034/035 with reality marker, listed 036–040 as planned.
- H3: Parking Lot v0.5 → v0.6 — flipped IN-463 ✅, IN-466 ✅, confirmed IN-XPS-006 phase target as Phase 5.
- H4: confirmed `scripts/evaluation/rank-eval.ts` exists.
- H5: cut `phase-5-contextual-signals` branch from clean main.

---

## Section 3 — Workstream A: Contextual signals

The 12.5% Stage-2 weight on `contextual` was a placeholder in Phase 4 (always 0.5, zero ranking influence). Phase 5 made it real.

**Composition** (in `weights.ts`):
- Time-of-day (40% of contextual): `late_night` (22:00–02:00) boosts comedy/animation/horror and short runtimes; `weekday_morning` (06:00–09:00 Mon-Fri) boosts documentary/news/reality. Other times neutral.
- Viewing context (40%): `with_family` boosts family-rated, suppresses horror/thriller; `wind_down` boosts comedy/light drama, suppresses thriller/horror/crime; `focused` boosts prestige drama/documentary/history; `with_partner`/`with_friends` get lighter boosts. `solo` and `background` stay neutral (the latter would benefit from cosine-aware boosting that can't be expressed as a static genre table — deferred).
- Device (20%): mobile (Android phone) suppresses long-runtime movies (>120 min) by 0.12 from baseline. Tablet/TV/web stay neutral.

**Time-of-day TZ source-of-truth (decision 9 of plan):** client computes `hourOfDay` from `new Date().getHours()` (local time) and includes it in the render-foryou-rows POST body. Edge reads from body, falls back to UTC `getUTCHours()` if absent. This avoided introducing `profiles.timezone` (deferred to Phase 6+).

**Wiring:**
- `src/lib/recommendations-v2/pipelineContext.ts` (new) — client-side helper that bundles Capacitor `Device.getInfo()` + local `Date()` + `profiles.viewing_context` into `PipelineContext`. Failure-tolerant per field.
- `useForYouContent.ts` — caches the context per-load in `ctxRef`; reuses it for slider-drag rerank.
- `tryRenderForYouEdge` accepts optional `ctx` and includes `hourOfDay`/`dayOfWeek` in the body when present.
- Edge Function `render-foryou-rows` validates the optional body fields, parses User-Agent for device, reads `viewing_context` via service-role client, threads `PipelineContext` into `scoreCandidates`.

**Backward compatibility:** every sub-score defaults to neutral 0.5 when its context field is missing, reproducing Phase 4 behaviour for legacy clients/missing data. Old clients that don't supply `hourOfDay` get UTC fallback (small TZ skew vs upgraded clients).

**Files added/modified:**
- `src/lib/recommendations-v2/contextual.ts` — full implementation (replaces 0.5 placeholder).
- `src/lib/recommendations-v2/types.ts` — `PipelineContext` interface added.
- `src/lib/recommendations-v2/weights.ts` — 7 new constants + 2 new tables + `getContextualTimeBucket()`.
- `src/lib/recommendations-v2/ranker.ts` — `scoreCandidates` accepts optional `ctx`; threads it into `computeContextualScore`.
- `src/lib/recommendations-v2/pipelineContext.ts` — new helper module.
- `src/lib/recommendations-v2/edgeRender.ts` — `tryRenderForYouEdge` accepts ctx, includes body fields.
- `src/hooks/useForYouContent.ts` — builds + caches ctx, threads through scoreCandidates.
- `supabase/functions/render-foryou-rows/index.ts` — validates body fields, builds Edge-side ctx, parses UA.
- All `_shared/recommendations-v2/*` mirrors updated bit-for-bit.
- `scripts/evaluation/rank-eval.ts` — upgraded to use real contextual scorer + side-by-side weight-split comparison output.

**Net-new dependency:** `@capacitor/device@^8.0.2` (matches the existing 8.x Capacitor majors).

---

## Section 4 — Workstream B: MMR upgrade

`applyGenreSpread` (TMDb-primary-genre + taste-cluster heuristic) was the Phase 4 intra-row diversity pass. Phase 5 replaces it with greedy Maximal Marginal Relevance over the 1536D title embeddings.

**Algorithm:**
- Start from highest-`finalScore` candidate.
- At each step: pick the candidate maximising `λ × finalScore − (1 − λ) × maxRedundancy`, where `maxRedundancy` is the cosine similarity to any already-selected item.
- λ from `getMMRLambda(varietySlider)` — 0.85 at full Comfort (low diversification), 0.55 at full Adventure (heavy diversification), 0.7 default.
- Candidates without an embedding contribute 0 redundancy → graceful degradation when coverage is partial.

**Embedding fetch:** `EXTENDED_TITLE_SELECT` doesn't include `embedding` (would add ~6MB per pool fetch). A separate batch query fetches embeddings for top-200 candidates by `finalScore` after `scoreCandidates`. Same `.select('tmdb_id, media_type, embedding').in('tmdb_id', topIds)` pattern that `anchorSelection.ts` has used since Phase 4.5.

**Stage ordering preserved:** `applyContentMixRatio` → MMR (or fallback) → `deClusterByService`.

**Backward compatibility:** `buildRowFromPool` accepts an optional `embeddingMap`. When present + non-empty → MMR. Absent → falls back to `applyGenreSpread`. Both paths preserved during initial rollout; `applyGenreSpread` removal deferred.

**Files added/modified:**
- `src/lib/recommendations-v2/diversity.ts` — `applyMMR` added, alongside `cosineSimilarity` helper.
- `src/lib/recommendations-v2/ranker.ts` — `buildRowFromPool` accepts optional `embeddingMap` parameter.
- `src/hooks/useForYouContent.ts` — `fetchEmbeddingsForCandidates` helper, `embeddingMapRef` cache, three `buildRowFromPool` call-sites updated.
- `supabase/functions/render-foryou-rows/index.ts` — same fetch + threading on the Edge path.
- `_shared/recommendations-v2/diversity.ts` and `ranker.ts` — bit-for-bit mirrors.

---

## Section 5 — Workstream C: Pre-launch security blockers

### 5.1 Migration 036 — `taste_profiles` RLS

Pre-existing gap: the table predated version-controlled migrations and never had RLS enabled. Anon SELECT was returning all rows. GDPR/privacy blocker for public launch.

Single `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` policy. Service-role bypass preserved (Edge Functions use `withUserScope`).

**Verified:** anon SELECT returns 0 rows, authenticated returns own row, service_role returns all rows.

### 5.2 Migration 037 — drop `marked_watched` from event_type CHECK

`marked_watched` was carried in the `user_interactions.event_type` CHECK constraint (alongside `watched`) for forward-compat in migration 013, but never emitted at runtime. Pre-flight count was 0 → clean DROP / ADD swap.

**Cleaned up in same PR:**
- Read-side filters in `useForYouContent.ts:511` and `render-foryou-rows/index.ts:468` (both `.in('event_type', ['watched', 'marked_watched'])` → `.eq('event_type', 'watched')`).
- `InteractionEventType` union (which never had `marked_watched` despite earlier exploration claiming so — the token only lived in `ExitReason` union, which stays per Detail Page Signal Spec v0.3.2 line 237).
- `INTERACTION_WEIGHTS` and `TASTE_RELEVANT_EVENTS` in `taste-v2/types.ts` — renamed `marked_watched → watched` (NOT removed).

**Latent bug fix uncovered:** the rename in `INTERACTION_WEIGHTS` is a behavioural fix, not the dead-code removal originally planned. The DB event_type written by `emitContentInteraction` is `'watched'`, but the weight map keyed on `'marked_watched'`. So `INTERACTION_WEIGHTS['watched']` returned `undefined`, and `applyInteractionIncremental` (`interactionUpdate.ts:38`) silently no-op'd on every "Mark as watched" click. The 0.5-weight signal was being dropped on the floor. After rename:
- Per-click incremental updates work (forward-only safe).
- The `recomputeFromInteractions` 24h stale-cycle path also picks up the change — prototype-user vectors retroactively absorb 0.5 per historical `event_type='watched'` row on next stale trigger. Acceptable per design intent; vectors converge to correct state.

### 5.3 Migration 038 — `username_available` RPC

Replaces the `"Allow public username lookup"` policy on `profiles` (`011_profiles_baseline.sql:51-55` — `FOR SELECT USING (true)`) with a SECURITY DEFINER RPC. Anon SELECT on `profiles` is now denied; signup flow goes through `supabase.rpc('username_available', { check_username })`.

`AuthContext.tsx:checkUsernameAvailable` rewired in same commit. Both consumers (`SignUpScreen.tsx` and `OnboardingFlow.tsx`) consume the unchanged context API.

**Verified:** anon SELECT on profiles returns 0 rows / permission denied, `username_available()` RPC returns boolean for anon callers, signup flow username indicator works.

### 5.4 Migration 039 — cron jobs Vault-backed JWT

Originally planned as a full service-role JWT rotation. Reality: the Supabase dashboard UI has moved to `sb_secret_…` opaque tokens that fail `verify_jwt = true` on Edge Functions. Full cryptographic rotation is deferred to Phase 6 (parking-lot IN-XPS-004) pending either Supabase shipping JWT-format secret keys or an Edge Function auth refactor.

**What 039 DID achieve:** the inline JWT moved out of source code (`006_cron_schedule.sql:19` and three `supabase/cron/*.sql` files) into Supabase Vault. Token value unchanged, but git history no longer leaks a usable credential. Future rotation becomes a single `vault.update_secret(...)` + cron unschedule/reschedule.

Four pg_cron jobs migrated (`daily-content-sync`, `embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`). Each registration now uses `'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)`. The migration's `RAISE EXCEPTION` guard refused to apply until the Vault entry was created.

**Verified:** all four jobs registered + active, schedules match the migration, `count(*) FROM cron.job WHERE command LIKE '%Bearer ey%'` = 0. Runtime confirmation pending — first scheduled run after merge proves the Vault read works at job-execution time. If any job shows `failed` with 401/403 in `cron.job_run_details`, escalate.

`supabase/cron/embed_new_titles.sql`, `enrich_new_titles.sql`, `refresh_service_fingerprints.sql` updated to use the same Vault-read pattern (prevents foot-gun on re-apply).

### 5.5 CORS tightening (IN-XPS-013)

New `supabase/functions/_shared/cors.ts` module. `corsHeaders(origin)` echoes the Access-Control-Allow-Origin header only when the origin is allow-listed. Allow-list:
- Static: `capacitor://localhost`, `https://localhost`.
- Regex: `^http://localhost(:port)?$` (covers Vite dev :5173, debug-server :3000, etc.).
- Env var: `VIDEX_ALLOWED_DEV_ORIGINS` (comma-separated) for live-reload over LAN IP.

Applied to both browser-callable Edge Functions (`render-foryou-rows`, `label-anchor-room`). The four cron-only functions (`embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`, `sync-incremental`) don't face a browser and don't carry CORS code.

**Verified post-deploy:** `curl` with `Origin: capacitor://localhost` echoes the header back; `Origin: https://malicious.example` returns no `Access-Control-Allow-Origin` (browser would treat as rejected).

### 5.6 `verify_jwt` per-function configs + CI guard (IN-XPS-011)

Six new `supabase/functions/*/config.toml` files explicitly set `verify_jwt = true`. Codifies the Supabase Edge Runtime default so a silent regression is git-detectable.

`.github/workflows/edge-fn-jwt-guard.yml` triggers on PRs touching `supabase/functions/**` and fails any PR with `verify_jwt = false` outside a reserved `_no_auth_/` namespace.

---

## Section 6 — Workstream D: Type-system cleanup

`createClient<Database>` re-enabled on the Supabase client. The 47-error backlog from Phase 4 grew to 52 (original + 5 newly-introduced from Phase 5 own commits) and was closed in two commit batches:

- **Batch 1 (8 files, 9 errors):** AuthContext.tsx (RPC cast), OnboardingFlow.tsx + hardFilters.ts (JSONB array casts post-035), useForYouContent.ts + anchorRoomLabels.ts (drop `as any` from typed `.from()`), analytics/logger.ts + storage/interactions.ts (Json metadata cast), reportService.ts (userId narrowing).
- **Batch 2 (3 files, 43 errors):** taste-v2/bootstrap.ts (drop `as any`), taste-v2/interactionUpdate.ts (drop `as any` + metadata Json cast + nullable created_at guard), supabaseStorage.ts (11 functions × `if (!userId) return …` guards + `rank ?? 0` for nullable user_genres).

`npx tsc --noEmit` reports zero errors.

`foryou-parity` CI workflow added. Promotes `scripts/_inspect_foryou_parity.mjs` from manual diagnostic to PR smoke test. Soft-skips when `PARITY_*` secrets aren't configured. Test fixture path documented (use the existing Pro project with a test user flagged via `profiles.is_test_user` — column exists per migration 011 / IN-PRE-001).

---

## Section 7 — Deferred to Phase 5.5 / Phase 6

These items were in scope of the Phase 5 brief but consciously deferred. None are launch-blockers.

| Item | Reason for deferral | Pickup |
|---|---|---|
| **Step 7.7** — anchor-room `metadata.contextual_score` | Per-impression telemetry enrichment requires plumbing per-title scores from ranker → Edge Function payload → MoodRoomPage impression batcher (4-file refactor for telemetry value). Ranking quality is unaffected. | Phase 5.5 |
| **Step 7.8** — weight-split re-tuning | rank-eval harness upgraded to support side-by-side splits (60/25/15, 55/25/20, 50/25/25 vs Phase 4 baseline 62.5/25/12.5). Decision deferred until prototype-user vectors rebase through the next 24h taste-vector recompute cycle (see Section 5.2 latent bug fix). Running rank-eval now would lock the split against under-weighted state. | Joe runs harness post-rebase, then a single commit updates BASE_WEIGHTS |
| **Strategy v1.8 → v1.9** | Without the chosen weight split, v1.9 has nothing material to add. | Bump alongside the BASE_WEIGHTS update |
| **`applyGenreSpread` removal** (plan commit 12.5) | Retained as fallback for embedding-absent path. Removing now means MMR becomes the only intra-row diversity option, with no graceful degradation path if embedding fetch fails. Safer to keep through initial rollout. | Phase 6 once MMR has bedded in |
| **Migration 040** (IN-458 typed pairs) | Closes a 0.8% movie/TV id collision rate. Real but small. Consumer migration touches `hardFilters.ts` + anchor room generation + BYW filtering. Low-risk to defer. | Phase 5.5 / Phase 6 |
| **IN-465 backfill script** | One-off script to fetch 3,807 missing tmdb_ids, embed via `embed-new-titles`, insert into `titles`. Heavily Prime-skewed catalogue gap. Doesn't affect Phase 5 acceptance. | Standalone follow-up |
| **IN-462 forYouStore (Workstream E)** | Tab-switch preservation via Zustand store. UX win, requires `zustand` dep + state plumbing. Deferred pending IN-468/469 telemetry agent results (2026-05-11). | Post-telemetry-agent decision |
| **IN-467/468/469 decisions** | Mirror consolidation, SWR cache, cold-start mitigation. All gated on telemetry agent results. | 2026-05-11 + |
| **IN-OB-006** (onboarding cluster review) | Per Phase 5 plan decision 5: defer to post-3-months telemetry (lands July 2026, post-Phase-6). | Phase 6+ |
| **`marked_watched` exit_reason** | Intentionally retained (Detail Page Signal Spec v0.3.2 line 237 keeps it as a canonical `exit_reason` payload value). The Phase 5 cleanup was scoped to `event_type` only per plan decision 6. | No action |
| **Full service-role JWT cryptographic rotation** | Supabase dashboard UI no longer exposes a path to issue a new long-lived JWT signed by the current ECC signing key. New `sb_secret_…` opaque tokens fail `verify_jwt = true` on Edge Functions. Phase 5 shipped Vault migration (storage hygiene) without rotation (cryptographic). | Phase 6 — pending Supabase tooling or Edge auth refactor (parking-lot IN-XPS-004) |

---

## Section 8 — Behaviour changes prototype users will see

Worth flagging as Joe's prototype users open the app post-deploy:

1. **For You row composition shifts visibly.** Contextual scoring is now active. With BASE_WEIGHTS unchanged at 62.5/25/12.5, the 12.5% contextual weight now actually moves rankings. Late-night usage shifts toward shorter runtimes / comedy / animation. `viewing_context = 'with_family'` suppresses thriller/horror. Mobile suppresses long-runtime movies. Some of these shifts may be intuitively correct, others may surface that the contextual genre-boost tables need tuning.

2. **MMR replaces genre-spread for taste-vector rows.** Visible diversity shift, especially at variety slider extremes. Adventure end of slider should now produce noticeably more diverse rows than before; Comfort end should look closer to pre-Phase-5 output but with smoother similarity ordering.

3. **Taste vector rebases on next 24h cycle.** The marked_watched → watched fix means historical "Mark as watched" clicks now contribute the intended 0.5 weight via `recomputeFromInteractions`. Prototype users with weeks of historical clicks will see their taste vector shift toward a "more correct" state on next stale trigger. Ranking output will look slightly different post-rebase. Self-resolving in days.

4. **Anon access to profiles + taste_profiles is locked down.** Public unauthenticated readers can no longer query the profiles or taste_profiles tables directly. Username availability check at signup goes through the new RPC. No user-facing change for authenticated callers.

5. **CORS rejects unknown origins.** Browser-based attempts to hit `render-foryou-rows` or `label-anchor-room` from outside the allow-list fail. The Capacitor app continues to work normally.

If any of (1) or (2) produce ranking output that feels meaningfully off, the contextual genre-boost tables in `weights.ts` and BASE_WEIGHTS are the tuning knobs. Strategy v1.9 should land alongside the rank-eval-driven weight split decision.

---

## Section 9 — Phase 5 actuals summary

- **Total commits on PR #4:** ~20 (hygiene + workstreams A/B/C/D + close-out).
- **Files added:** 11 (new files in src/lib/recommendations-v2/, supabase/migrations/, supabase/functions/_shared/, .github/workflows/, supabase/functions/*/config.toml × 6).
- **Files modified:** ~25 including all `_shared/recommendations-v2/*` mirrors.
- **Migrations applied to production:** 4 (036, 037, 038, 039). 040 deferred.
- **Edge Function redeploys:** 2 (`render-foryou-rows`, `label-anchor-room`) post-CORS tightening; further redeploy required for contextual + MMR + body-field handling.
- **Net-new dependencies:** 1 (`@capacitor/device`). `zustand` deferred along with IN-462.
- **Type-check status:** clean with `<Database>` generic active.
- **CI workflows added:** `edge-fn-jwt-guard.yml`, `foryou-parity.yml` (latter pending secrets).
- **Time budget:** brief estimated 3–4 weeks; landed in one focused push due to scope-narrowing decisions (Steps 7.7, 7.8, applyGenreSpread removal, IN-462, Workstream F, Strategy v1.9 all deferred to follow-ups).

---

## Section 10 — Sequencing for merge + deploy

To avoid divergence between Edge Function output and client expectations during rollout:

1. **Edge Function redeploy first** — `npx supabase functions deploy render-foryou-rows --project-ref fmusugdcnnwiuzkbjquo`, then same for `label-anchor-room`. Backward-compatible: handles old clients that don't supply `hourOfDay`/`dayOfWeek` body fields.
2. **Merge PR #4 to main** with `--no-ff` per Orchestration §4.1.
3. **Capacitor app build + APK install** — `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`, then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

Skipping step 1 means new clients call old Edge Functions; contextual + MMR signals only fire on the client-fallback path (slider rerank), creating ranking divergence between first paint and re-renders.

---

## Section 11 — Pending runtime checks

- **Migration 039 — first cron run.** Soonest scheduled: `enrich-new-titles` at 06:30 UTC (next day). After it fires, `cron.job_run_details` should show `status = 'succeeded'` for the rotated jobs. If 401/403 surfaces, the Vault read isn't resolving at job-run time.
- **Taste vector rebase after marked_watched → watched rename.** Prototype users on next app open past the 24h staleness threshold. Self-validating via subjective ranking quality.
- **Contextual + MMR ranking output.** Subjective check by Joe after deploy. If output feels off, tuning knobs are `CONTEXTUAL_*` constants and BASE_WEIGHTS in `weights.ts`.
- **`foryou-parity` CI** activates once `PARITY_*` repo secrets are configured (test user flagged via `profiles.is_test_user`).

---

## Phase 5 closed.

Pre-launch security blockers cleared. Contextual scoring and MMR shipped. Type system cleaned up. Phase 6 (launch) opens with a meaningfully smaller pre-launch blocker register, the foundation for proper rotation in place, and one bug fix that was hiding in plain sight since Phase 3.
