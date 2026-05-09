---
title: Phase 5 — Contextual signals, MMR, pre-launch hardening
type: concept
tags: [phase, phase-5, contextual, mmr, security, vault, rls, hardening]
created: 2026-05-07
updated: 2026-05-07
sources:
  - docs/v2/phase-summaries/phase-5-summary.md
  - docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.6.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/phase-4.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/operations/service-role-jwt-rotation.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/codebase/rpcs.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/registers/parking-lot.md
  - wiki/registers/pre-launch-blockers.md
---

# Phase 5 — Contextual signals, MMR, pre-launch hardening

Closed 2026-05-06. Branch `phase-5-contextual-signals` (PR #4 merged to main). Predecessor: Phase 4 + 4.5 combined summary. Bundled every Phase 4 / 4.5 / IN-466 carry-over so Phase 6 is a clean launch-only effort.

## What was delivered

### Workstream A — Contextual signals (`contextual.ts` real)

The 12.5% Stage-2 contextual weight was a placeholder returning neutral 0.5 in Phase 4. Phase 5 replaced it with a real composition:

- **Time-of-day (40% of contextual budget):** `late_night` (22:00–02:00) boosts comedy / animation / horror and short runtimes; `weekday_morning` (06:00–09:00 Mon–Fri) boosts documentary / news / reality. Other slots stay neutral.
- **Viewing context (40%):** read from `profiles.viewing_context`. `with_family` boosts family-rated, suppresses horror/thriller. `wind_down` boosts comedy/light drama, suppresses thriller/horror/crime. `focused` boosts prestige drama / documentary / history. `with_partner` / `with_friends` get lighter boosts. `solo` and `background` neutral.
- **Device (20%):** Android phone suppresses long-runtime movies (>120 min) by 0.12. Tablet / TV / web neutral.

Each sub-score defaults to neutral 0.5 when its context field is missing → graceful degradation to Phase 4 behaviour for legacy clients.

**TZ source-of-truth (plan decision 9):** the client computes `hourOfDay` from `new Date().getHours()` (local time) and includes it in the `render-foryou-rows` POST body. The Edge Function reads it from the body and falls back to UTC `getUTCHours()` if absent. `profiles.timezone` capture deferred to Phase 6+.

**Wiring:**
- `src/lib/recommendations-v2/pipelineContext.ts` (new) — client helper bundling Capacitor `Device.getInfo()` + `new Date()` + `profiles.viewing_context` into `PipelineContext`.
- `src/lib/recommendations-v2/types.ts` — `PipelineContext` interface added.
- `src/lib/recommendations-v2/weights.ts` — 7 new constants (`CONTEXTUAL_TIME_WEIGHT`, `CONTEXTUAL_VIEWING_WEIGHT`, `CONTEXTUAL_DEVICE_WEIGHT`, mobile-runtime threshold/penalty, `ViewingContext` union) + 2 genre-boost tables + `getContextualTimeBucket()`.
- `src/lib/recommendations-v2/ranker.ts` — `scoreCandidates` accepts optional `ctx`; threads through to `computeContextualScore`.
- `src/hooks/useForYouContent.ts` — caches ctx in `ctxRef` per load; reuses for slider-drag re-rank.
- `supabase/functions/render-foryou-rows/index.ts` — body-field validation, `inferDevicePlatformFromUserAgent`, `buildEdgePipelineContext` (service-role profile read).
- All `_shared/recommendations-v2/*` mirrors updated bit-for-bit (enforced by `shared-tree-drift`).

**`BASE_WEIGHTS` 62.5/25/12.5 unchanged in Phase 5.** Weight-split re-evaluation deferred until prototype-user vectors rebase post-`marked_watched` fix; Strategy v1.9 ships the chosen split.

### Workstream B — MMR diversity upgrade

`applyMMR` replaces `applyGenreSpread` for For You taste-vector rows (Recommended For You, Hidden Gems, Outside Your Usual). Greedy MMR over 1536D embeddings: `λ × finalScore − (1 − λ) × max(cos sim to selected)`.

- λ from `getMMRLambda(varietySlider)`: 0.85 at full Comfort (low diversification), 0.55 at full Adventure.
- **Embedding fetch step:** `fetchEmbeddingsForCandidates(top 200 by finalScore)` runs once per load on both client and Edge paths. ~3MB JSON payload — dominant new Phase 5 latency cost. Phase 5.5 IN-PX-22 caches with 24h TTL.
- **`applyGenreSpread` retained** as fallback when the embedding map is empty (e.g. fresh sync, Edge fetch failure). Phase 5.5 IN-PX-23 plans a partial-coverage fallback (>50% missing → fall through to genre-spread).
- Diversity stage order preserved: `applyContentMixRatio` → `applyMMR` (or `applyGenreSpread` fallback) → `deClusterByService`.

### Workstream C — Security hardening (migrations 036–039)

| Migration | What it does |
|---|---|
| **036** | `taste_profiles` RLS: `ENABLE ROW LEVEL SECURITY`, single `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`. Pre-existing gap (table predates version-controlled migrations). Service-role bypass preserves Edge Function reads. Verified: anon SELECT returns 0 rows. |
| **037** | Drop `'marked_watched'` from `user_interactions.event_type` CHECK constraint. Pre-flight count was 0 → clean DROP / ADD swap. Read-side filters cleaned up in same PR (`useForYouContent.ts:511`, `render-foryou-rows/index.ts:468`). The `exit_reason` payload value (Detail Page Signal Spec v0.3.2) is unrelated and stays. |
| **038** | Replace `"Allow public username lookup"` wide-open anon policy with `username_available(check_username text) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE`. `AuthContext.checkUsernameAvailable` rewired to RPC. Anon SELECT on `profiles` now denied. |
| **039** | Move inline service-role JWT out of `006_cron_schedule.sql` and three `supabase/cron/*.sql` files into Supabase Vault. Same JWT value, different storage location. Re-create four cron jobs (`daily-content-sync`, `embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`) using `vault.decrypted_secrets` lookups. **Not a cryptographic rotation** — full rotation deferred to Phase 6+ pending Supabase JWT-format secret keys (current `sb_secret_…` opaque tokens fail `verify_jwt = true` on Edge Functions). |

**`verify_jwt` codified:** six new per-function `supabase/functions/<name>/config.toml` files set `verify_jwt = true` explicitly, codifying the Edge Runtime default so a regression is git-detectable. New `.github/workflows/edge-fn-jwt-guard.yml` blocks any PR that flips `verify_jwt = false` on a user-callable Edge Function.

**CORS tightened:** `supabase/functions/_shared/cors.ts` (new) exports `corsHeaders(origin)` that echoes the Origin header only when allow-listed (`capacitor://localhost`, `https://localhost`, `^http://localhost(:port)?$`, plus `VIDEX_ALLOWED_DEV_ORIGINS` env hook). Applied to `render-foryou-rows` and `label-anchor-room`.

### Workstream D — Type-system cleanup (`<Database>` generic re-enabled)

`<Database>` generic re-applied to the Supabase client (`src/lib/supabase.ts`). 52 errors surfaced (47 expected + 5 introduced by Phase 5 commits). Fixed across two batches:
1. Drop `as any` from `.from()` calls + various JSONB casts (8 files, 9 errors).
2. Per-file null guards + `as any` removal in `supabaseStorage.ts`, `bootstrap.ts`, `interactionUpdate.ts` + nullable-`created_at` guard (3 files, 43 errors).

`npx tsc --noEmit` clean post-batch. ESLint warning count down. Three remaining `as any` casts (`AuthContext.tsx`, `anchorRoomLabels.ts`, `interactionUpdate.ts`) annotated "until regenerated" — closed by IN-PX-21 once `database.types.ts` is regenerated against the live schema.

**`foryou-parity` CI workflow** authored (`.github/workflows/foryou-parity.yml`). Soft-skips when `PARITY_*` repo secrets aren't configured; once Joe wires them for a `is_test_user = true` profile, the probe enforces semantic parity between Edge and client paths on every relevant PR.

### Workstream E — UX carry-overs (deferred)

IN-462 (For You tab-switch preservation via `forYouStore.ts` zustand) deferred to Phase 5.5 — zustand dependency accepted, store not yet built. IN-467 / 468 / 469 decision documents pending telemetry agent input.

### Workstream F — Quality sweep

- **Latent bug fix landed.** `INTERACTION_WEIGHTS['marked_watched']` was the keyed name in `taste-v2/types.ts`, but `emitContentInteraction` writes `'watched'` to the DB — so per-click incremental updates were silently no-op'ing on every "Mark as watched" since Phase 3. Renamed map key to `'watched'`. Vectors rebase on the next 24h taste-recompute cycle (`recomputeFromInteractions` reads historical events).
- **Migration 040 deferred.** `get_available_tmdb_ids` media_type extension (IN-458) — additive new function `get_available_tmdb_id_pairs`, not in-place return-shape swap. Re-targeted to Phase 5.5.
- **IN-465 backfill script** (~3,807 missing tmdb_ids) — re-targeted to Phase 5.5.

## Verification

- `npx tsc --noEmit` clean with `<Database>` generic active.
- `shared-tree-drift` workflow green.
- `foryou-parity` workflow file in place; soft-skip until secrets configured.
- `edge-fn-jwt-guard` workflow file in place.
- All four migrations 036–039 applied to production via Studio SQL editor:
  - Anon SELECT on `taste_profiles` returns 0 rows.
  - `INSERT … VALUES ('marked_watched')` rejected by CHECK constraint.
  - `username_available()` RPC functional under anon role.
  - `SELECT count(*) FROM cron.job WHERE command LIKE '%Bearer ey%'` = 0.
  - Four cron jobs registered + active referencing `vault.decrypted_secrets`.

## Deviations from brief

1. **Sequencing:** D moved after A/B (brief §9.4 had it first). `contextual.ts` is pure — never touches Supabase. Doing D last meant the type sweep included contextual + MMR new code in one pass.
2. **`marked_watched` cleanup narrower than brief suggested.** Migration 037 drops only the `event_type` value. The `exit_reason` payload value documented in Detail Page Signal Capture Spec v0.3.2 line 237 stays.
3. **Migration 039 is not a cryptographic rotation.** Brief framing assumed key replacement; actual reality (Supabase opaque `sb_secret_…` tokens fail `verify_jwt = true`) forced a Vault-storage-only migration. Cryptographic rotation deferred to Phase 6+.
4. **TZ skew handled via decision 9.** Brief had Edge compute `getHours()` (UTC) while client computed locally — divergent contextual scores. Fix: client passes hour in body, Edge reads from body with UTC fallback.
5. **Two net-new dependencies** the brief glossed over: `@capacitor/device@^8.0.0` (matches existing Capacitor 8 majors) and `zustand` (~1KB; for IN-462 store, deferred to 5.5).

## Open items → Phase 5.5 / 6

See [parking-lot register](../../registers/parking-lot.md). Phase 5.5 cluster:

- **IN-XPS-006** Delete account UI gate flip + RPC audit + `041_delete_own_account.sql`.
- **IN-PX-34** Privacy Policy + Terms pages with functional links (store-rejection blocker).
- **IN-PX-35** Functional "Download my data" RPC (GDPR Article 20 blocker — current implementation is a fake-success toast).
- **IN-PX-21** Regenerate `database.types.ts` and delete remaining `as any` casts.
- **IN-PX-22 / 23 / 24** Embedding-fetch caching + MMR partial-coverage fallback + Float32Array precompute.
- **IN-PX-31** Trim `supabase/cron/*.sql` source-of-truth confusion (migration 039 + cron files duplicate registrations).
- **IN-458** Migration 040 (additive `get_available_tmdb_id_pairs`).
- **IN-465** Backfill script for ~3,807 missing tmdb_ids.
- **IN-462** For You tab-switch preservation via zustand store.

Phase 6 (pre-public-launch) cluster:

- **IN-XPS-004** Cryptographic JWT rotation once Supabase ships JWT-format secret keys (or Edge auth refactor).
- **IN-PX-29 / 30** `username_available` rate-limit + `extractUserIdFromJwt` defence-in-depth.
- **IN-PX-32** Mirror tree consolidation (`_shared/` as source-of-truth for leaf modules).
- **IN-PX-33** Property-level parity probe (golden output).
