---
title: Phase 5.5 — Quality, legal & catalogue hardening
type: concept
tags: [phase, phase-5-5, quality, legal, gdpr, catalogue, hardening, mmr, embedding-cache]
created: 2026-05-15
updated: 2026-05-15
sources:
  - raw/phase-summaries/phase-5.5-summary.md
  - raw/research/in-465-catalogue-sync-gap.md
  - docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.7.md
  - docs/v2/Videx_v2_Project_Orchestration_v0.7.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/phase-5.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/codebase/rpcs.md
  - wiki/registers/parking-lot.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/concepts/product/privacy-and-gdpr.md
---

# Phase 5.5 — Quality, legal & catalogue hardening

Closed 2026-05-15. Branch `claude/zealous-dijkstra-0fe0d7` (PR #11, awaiting merge to main). Predecessor: Phase 5 close-out (2026-05-06) and Phase Search V2 close-out (2026-05-13) — reordered ahead of Phase 5.5 per the kickoff brief deviation. Bundled three clusters into one PR so the legal blockers (delete + export RPCs, Privacy Policy, Terms of Service) ship together with the quality polish and the catalogue-gap closure.

## What was delivered

### Cluster A — Quality / type / performance (C1–C9)

**C1 — Type regen + cast cleanup + typegen-check CI.**
- Regenerated `src/lib/database.types.ts` against migrations 036–041 + `mood_room_anchor_labels` columns. The post-Phase-Search-V2 dependent (`src/lib/featureFlags.ts:47` for `user_feature_flags`) closed at the same time.
- Plan listed 4 `as any` casts at the Supabase boundary; **actual sweep removed 28 across 11 files** (the plan was an undercount, but the verification step demanded zero boundary casts). Latent type errors surfaced + fixed: `BufferedImpression.metadata` and `buildAnchorImpressionMetadata` return shape both shifted from `Record<string, unknown>` to a `Json`-compatible type.
- Retained one cast: `useHomeContent.ts` for `editor_notes` (migration 040 lives in the repo but isn't applied to remote — the table is genuinely absent from the schema). Comment updated to reflect reality.
- New `.github/workflows/typegen-check.yml` — runs `supabase gen types typescript` on every PR touching `supabase/migrations/**` or `supabase/config.toml`, diffs against the committed `database.types.ts`, fails on drift. Includes a workaround stripping the `<claude-code-hint />` trailer the Supabase CLI 2.x emits.

**C2 — `ViewingContext` to source of truth + boundary narrowing.**
- Moved the `ViewingContext` union from `weights.ts` to `types.ts` so `PipelineContext` can reference it without a circular import. `weights.ts` re-exports for backward compat.
- `PipelineContext.viewingContext` tightened from `string | null` to `ViewingContext | null`. The `as ViewingContext` cast in `contextual.ts` dropped.
- Defensive narrowing helper (`narrowViewingContext`) added at both DB boundaries (`pipelineContext.ts` client, `render-foryou-rows/index.ts` Edge). Unknown DB values fall to `null` rather than being silently coerced at score time.

**C3 — `buildRowFromPool` options object.**
- Five positional params + `undefined` placeholders → single options object. Six call sites updated (3 client + 3 Edge). Mechanical refactor; identical For You output pre/post.

**C4 — MMR partial-coverage fallback.**
- `applyMMR` returns `{ selected, bailedOut }` instead of a bare array.
- Named constants at top of `diversity.ts`: `MMR_NULL_RATIO_BAIL = 0.5`, `MMR_MIN_SAMPLE = 4`. When > 50% of selected items have null embeddings after at least 4 picks, MMR returns `bailedOut: true`.
- `buildRowFromPool` catches the signal and falls through to `applyGenreSpread` for the full row. Hidden Gems / Outside Your Usual rows (back-catalogue + niche regime) most affected.

**C5 — Embedding cache + Float32Array + cached cosine norms.**
- New module `src/lib/recommendations-v2/embeddingCache.ts` owns `getCachedEmbeddings` / `setCachedEmbeddings` / `clearEmbeddingCache`. Storage: `localStorage` keyed `videx_emb_${userId}:${tasteProfilesUpdatedAt}`, 24h TTL, encoded as `Array<[contentKey, number[]]>` for JSON.
- **Simplified cache key vs plan v1.** Plan v1 had 4 components (userId + tasteVectorHash + filterSetsSizesHash + tasteProfiles.updated_at). Plan v3 review collapsed to 2 (userId + tasteProfilesUpdatedAt) — `taste_profiles.updated_at` ticks on every taste-vector recompute and slider persistence; embeddings are immutable per tmdb_id, so misses fetch transparently. Hash-derivation surface eliminated.
- Per-Edge-instance Map keyed identically in `render-foryou-rows/index.ts`. No TTL (instance lifecycle is short).
- **Map shape change (IN-PX-24):** `Map<string, number[]>` → `Map<string, { vec: Float32Array; norm: number }>` at MMR consumers only. `cosineSimilarity` rewritten to take `CachedEmbedding` pairs, multiplies pre-computed L2 norms — skips per-call `Math.sqrt(normA * normB)`. **~3× MMR hot-loop speedup** on 1000-candidate × 50-selected microbenchmark.
- `clearEmbeddingCache()` wired into every signOut path. Originally only the manual `signOut` callback; post-review fixup hooked into `onAuthStateChange` SIGNED_OUT to cover JWT expiry / multi-tab / server-side invalidation.

**C6a — Vitest rig setup.**
- Added `vitest` + `jsdom` + `@vitest/ui` + `@testing-library/jest-dom` as devDeps.
- `vitest.config.ts` with `@ → src` alias, jsdom environment. Excludes pre-existing tsx-script-style tests under `src/lib/search/__tests__` and `src/lib/taste-v2/__tests__` (those keep their dedicated `npm run test:search-*` invocations).
- `npm test` and `npm run test:watch` scripts. CI runs `npm test` after typecheck + lint in `typecheck-lint.yml`.

**C6b — 10 pure-function tests.**
- `src/lib/recommendations-v2/__tests__/contextual.test.ts` (5 tests): late-night comedy vs documentary, with_family + horror suppression, empty ctx neutral, mobile long-runtime penalty, weekday_morning vs neutral-time documentary.
- `src/lib/recommendations-v2/__tests__/diversity.test.ts` (5 tests): MMR λ=1 sort-by-score, empty embeddingMap no-crash, all-redundant collapse, partial-coverage bailout, cached-norm precision equivalence (IN-PX-24 precision guard).
- `cosineSimilarity` exported from `diversity.ts` (and `_shared` mirror) for the precision-equivalence test.

**C7 — `edge-fn-jwt-guard` central config scan.**
- Existing workflow scanned per-function `config.toml` files. C7 adds a second grep pass over `supabase/config.toml` so a future `[functions.<name>] verify_jwt = false` block at the central level also triggers CI failure. Workflow trigger now includes `supabase/config.toml`.

**C8 — `supabase/cron/*.sql` deleted.**
- Three SQL files (`embed_new_titles`, `enrich_new_titles`, `refresh_service_fingerprints`) deleted. They were duplicate copies of registrations already owned by migration 039 with no enforcement contract — drift hazard.
- `supabase/cron/README.md` added as a stop-sign note for future engineers. Orchestration §3.4 paragraph updated.

**C9 — `foryou-parity` golden probe + JWT refresh script.**
- `scripts/_inspect_foryou_parity.mjs` extended with `--update-golden` flag. Default mode reads the golden, runs the probe, deep-equals on a property-level snapshot (per-item id + matchPercentage + anchor tier + slider echo; time-dependent fields excluded). Property-level divergence → hard fail.
- New `scripts/test/refresh-parity-jwt.ts` — one-command JWT refresh via Supabase Auth REST (signs in via email + password, writes access token to stdout for `gh secret set` piping). Removes the monthly Studio-dance footgun from the plan v3 review.
- `scripts/test/README.md` documents the secrets list + regen path + JWT refresh cadence.
- Workflow narrowed to ranking-pipeline + probe touch points (`recommendations-v2/**`, `_shared/recommendations-v2/**`, `render-foryou-rows/**`, the probe script itself, the golden file).
- **Activated 2026-05-15** with all 5 secrets in place + golden seeded for test user `3719d29e-…`. Golden file: 6,083 bytes, 73 items across 8 sections.

### Cluster B — Legal disclosures (C10–C16)

See [Migrations 042, 043](../../entities/codebase/migrations.md) and [RPC catalogue](../../entities/codebase/rpcs.md) for the full SQL trail.

**C10 — Migration 042 `delete_own_account`.**
- H5 pre-cut audit captured the live RPC body — a minimal single-line `DELETE FROM auth.users WHERE id = auth.uid();` relying entirely on FK cascades.
- FK cascade audit (Q1-rev) confirmed all 8 user-scoped tables have `ON DELETE CASCADE` chains terminating at `auth.users`. The live behaviour was GDPR-compliant at audit time.
- Migration 042 captures the same behaviour with explicit DELETEs across 8 tables as belt-and-braces defence: `card_impressions`, `user_interactions`, `taste_profiles`, `user_services`, `user_genres`, `watchlist`, `onboarding_events`, `user_feature_flags`, then `profiles`, then `auth.users`. Survives a future cascade-rule regression.
- DROP FUNCTION IF EXISTS + CREATE OR REPLACE + SECURITY DEFINER + search_path pinned + raises if `auth.uid()` is NULL.
- **Apply quirk:** first apply errored on a `||`-concatenated COMMENT string. Studio's SQL editor wraps the paste in an implicit transaction; the COMMENT failure rolled back the entire migration. Fixup commit collapsed `||` to single-line literals; both 042 and 043 re-applied cleanly.
- **Supabase auto-grant gotcha noted in migration comment:** the `REVOKE FROM PUBLIC, anon` doesn't stick — Supabase auto-grants EXECUTE to anon/authenticated/service_role on every `public.*` function so PostgREST can route to it. The functional auth gate is the body's `IF v_user_id IS NULL THEN RAISE` check, not the grant.

**C11 — Throwaway-account smoke test (validated 2026-05-15).**
- Throwaway user UUID `59f652dc-…` with realistic engagement: **113 `card_impressions`** + 6 `onboarding_events` + 3 `user_services` + 1 profile / taste / auth row.
- Post-`delete_own_account()` snapshot: every count = 0; `auth.users` row gone. The 113 → 0 cascade specifically validates the partitioned `card_impressions` FK CASCADE works in production (~100 partitions each with their own FK row, all dropped atomically).
- Helper script `scripts/test/c11-delete-account-smoke.ts` ships for future re-runs.

**C12 — Delete-account UI flip + type-username confirm.**
- `ProfilePage.tsx` `PrivacyDataPage` — removed the "not yet available" paragraph; added a confirmation input bound to `confirmUsername` state. Button disabled until `confirmUsername.trim().toLowerCase() === currentUsername.trim().toLowerCase()`.
- Case-insensitive trimmed match handles `profiles.username` being plain `TEXT UNIQUE` (no citext). User-typed casing may differ from stored casing.
- `handleDelete` threads through to existing `AuthContext.deleteAccount`, which calls the RPC + `clearAllData()` + signOut. The signOut path now also fires `clearEmbeddingCache` (per C5).

**C13 — Privacy Policy + Terms of Service drafts.**
- `docs/legal/privacy-policy.md` — 11 sections covering who/what/where/third-parties/what-we-don't-do/user-rights/retention/cookies/children/changes/contact. Third-party section explicitly states no PII flows to TMDb/OMDb/RapidAPI/OpenAI — OpenAI specifically only sees title text in cron-time embedding jobs.
- `docs/legal/terms-of-service.md` — 12 sections: acceptance, service description, eligibility, account, acceptable use, IP, disclaimer, liability, termination, UK governing law, changes, contact.
- **Mandatory lawyer-vetting caveat footer** on both docs: "This document has not been reviewed by a qualified UK solicitor. Solicitor review is required before App Store / Google Play submission and before any non-prototype user base accesses the product." Filed as **IN-XPS-014** — hard pre-launch blocker.
- Two placeholders: `[your-contact-email-address — TBC]` and `[your-UK-postal-address — TBC]`. Intentionally left visible to signal not-launch-ready.

**C14 — Render Privacy + ToS sheets + wire links.**
- New `PrivacyPolicyPage.tsx` + `TermsPage.tsx` — full-bleed overlay sheets rendering the markdown via `react-markdown` from Vite's `?raw` query (source-of-truth stays in `docs/legal/`).
- Wired into `OnboardingFlow.tsx` signup-step legal spans (spans → buttons) and `ProfilePage.tsx` `PrivacyDataPage` (two new rows alongside "What Videx learns").
- `react-markdown` added to dependencies. Default Vite `fs.allow` includes the worktree root, no `vite.config.ts` change needed.

**C15 — Migration 043 `export_user_data`.**
- GDPR Article 20 (portability) + Article 15 (access). Returns a `jsonb` object keyed by user-scoped table, scoped to `auth.uid()` on every query.
- Tables: `profiles`, `taste_profiles`, `user_services`, `user_genres`, `watchlist`, `user_interactions`, `card_impressions` (capped to last 90 days — matches migration 014's daily-aggregate rollup), `onboarding_events`. Plus `_export_metadata` with version + generated_at + user_id.
- Empty tables return `'[]'::jsonb` via `COALESCE` so the frontend iterates without null-guards.
- Same defensive elements as 042 (DROP IF EXISTS, SECURITY DEFINER, search_path pinned, RAISES on null `auth.uid()`).
- Verified via Studio post-apply: `prosecdef = true`, `search_path = public,pg_temp`. Smoke-test from SQL editor raises on null `auth.uid()` — the auth gate working as designed.

**C16 — Real Blob / Capacitor Filesystem download.**
- New helper `src/lib/storage/userExport.ts` owns the RPC call + delivery branch:
  - `Capacitor.isNativePlatform()` → `@capacitor/filesystem` `Filesystem.writeFile` to `Directory.Documents` (scoped storage handled by the plugin on Android 11+).
  - Web fallback → synthesise a `Blob`, create `<a download>`, click, revoke object URL.
- Both paths produce the same JSON shape. Filename: `videx-export-YYYY-MM-DD.json`.
- `ProfilePage.tsx` "Download my data" button — replaced the fake `toast.success("Download started")` with a real `handleExport` tracking `isExporting` state, label swap "Preparing your data…", `toast.error` on failure.
- `@capacitor/filesystem` added to dependencies.

### Cluster C — Catalogue gap closure (C17–C18)

See [in-465 investigation doc](../../../raw/research/in-465-catalogue-sync-gap.md) for the diagnostic detail.

**C17 — IN-465 investigation + verdict.**
- Diagnostic outputs (2026-05-15):
  - Q1 missing-count: **5,446** distinct `(tmdb_id, media_type)` pairs (up ~43% from plan-time 3,807 — week of organic SA-API growth).
  - Q2 by media_type: 4,511 movies (83%) / 935 TV (17%).
  - Q3 by service: **Prime 4,582 (84%)**, Apple 301, Channel4 233, Netflix 194, ITVX 99, Disney 74, Paramount 62, NOW 51.
  - 100-ID TMDb sampler: 23% TMDb-404 (deleted stubs), 74% pre-2010, 79% in popularity q1 (<5), top genres Drama / Comedy / Romance.
- **Verdict: MID priority.** Five co-pointing signals (Prime / movie / pre-2010 / low-pop / mainstream-genre) at one root cause: TMDb `/discover` 500-page hard cap × `sort_by=popularity.desc` excludes Prime's long-tail back-catalogue.
- **Critical pipeline-split finding** (the simplification that mattered): `daily-content-sync` cron calls the `sync-incremental` Edge Function, which only writes to `streaming_availability` — **never creates `titles` rows**. `titles` rows are created exclusively by the manual `scripts/sync-content.ts:stageTmdb` script.
- **Consequence:** `scripts/backfill_missing_titles.ts` IS the recurring fix — its query `streaming_availability LEFT JOIN titles WHERE titles IS NULL` catches whatever SA has added since the last run. No separate discover-pattern patch needed. Phase 6 follow-up **IN-PX-50** wraps it in a scheduled Edge Function.

**C18 — Backfill executed 2026-05-15.**
- Script: `scripts/backfill_missing_titles.ts`. Rate-limited at 260ms / ~4 req/s (matches `sync-content.ts`). `onConflict: 'tmdb_id,media_type'` for idempotence.
- **Production run results:** missing_n=5,446 → **upserted=2,698** (50%), TMDb-404=2,748 (50%), errored=0. The 2,748 stay missing forever (TMDb-deleted stubs / merged duplicates) — that's correct behaviour.
- Post-run verification: `missing_n = 2,748` (matches 404 count); `titles` grew 20,140 → 22,838.
- **Two mid-run bug fixes shipped:** PostgREST default 1000-row page limit was under-counting missing tmdb_ids (paginated SA + titles pulls in 1000-row chunks); TMDb empty-string `release_date` rejected by Postgres date column (null-coerce on empty + length-zero).
- 24h post-run check: spot-check 5 backfilled IDs in the app — confirm `embed-new-titles` (06:45 UTC) and `enrich-new-titles` (06:30 UTC) crons picked them up.

## Deviations from plan v3

- **C1 cast count.** Plan listed 4 sites; actual sweep removed 28 across 11 files. Verification step ("git grep `as any` shows only unrelated patterns") was load-bearing and forced the broader scope.
- **Migration numbering.** Plan v3 named 041 (delete) and 042 (export). Live numbering: `041_user_feature_flags.sql` shipped earlier in Phase Search V2, so Phase 5.5 migrations became **042** and **043**. Migration `040_editor_notes.sql` lives in the repo but is unapplied to remote.
- **C5 cache key simplified post-review.** Plan v1 had 4 components; plan v3 review collapsed to 2.
- **C17 recurring-fix discovery.** Plan v3 anticipated a discover-pattern patch on `scripts/sync-content.ts` or its cron equivalent. Investigation surfaced there is no cron equivalent for the titles-creation side — `daily-content-sync` only refreshes availability. The backfill script IS the recurring fix.
- **Studio implicit-transaction quirk.** Migrations 042 + 043 both initially failed on the same `||`-concatenated `COMMENT` string. Studio wraps the paste in an implicit transaction; trailing COMMENT failure rolled back the function creation. Single-fixup commit collapsed both to single-line literals.

## Post-merge review pass

Two specialist agents at PR close (2026-05-15):

- **kieran-typescript-reviewer:** SHIP-IT with 2 MUST-FIX nits (both fixed pre-merge in commit `e9c8560`):
  - `clearEmbeddingCache()` hooked into `onAuthStateChange` SIGNED_OUT event (was only firing on manual `signOut` callback — missed JWT expiry / multi-tab / server-side invalidation).
  - Edge `fetchEmbeddingsForCandidates` dead unreachable `if` block removed; `map` typed against `EmbeddingMap`.
  - Filed as follow-ups: IN-PX-51 (resolved this commit), IN-PX-52 (Edge typegen for `_shared/`), IN-PX-53 (Safari mobile 5MB quota), IN-PX-54 (CI check for user-scoped tables in delete + export RPCs).

- **repo-research-analyst:** wiki audit returned 404 (no GitHub wiki exists at the time of the initial review pass — Joe later surfaced the local Karpathy-style wiki at `videx-wiki/`). Three README sections updated (Profile features, Edge Functions list, Tech Stack).

## Items deferred

- Strategy v1.9 weight-split re-tune. Out-of-scope workstream; gated on prototype-user vectors rebasing through next 24h taste-recompute cycle (the `marked_watched → watched` fix from Phase 5), then `scripts/evaluation/rank-eval.ts`.
- Migration 040 (IN-458 typed pairs) — Phase 6.
- IN-PX-32 mirror-tree consolidation, IN-PX-36 SemDeDup, IN-PX-37 popularity de-bias — all Phase 6.
- IN-462 forYou tab-switch session store — Phase 6 (paired with IN-468/469 post-telemetry).
- New entries filed for Phase 6: **IN-XPS-014** (UK solicitor review — hard pre-launch blocker), **IN-PX-50** (scheduled catalogue-gap backfill Edge Function), **IN-PX-52/53/54** (review-pass follow-ups).

## Files added (net)

- `.github/workflows/typegen-check.yml`
- `src/lib/recommendations-v2/embeddingCache.ts` + `_shared/` mirror
- `vitest.config.ts`
- `src/lib/recommendations-v2/__tests__/{contextual,diversity}.test.ts`
- `supabase/cron/README.md` (replacing the deleted `*.sql` files)
- `scripts/test/{foryou-parity-golden.json, refresh-parity-jwt.ts, README.md, c11-delete-account-smoke.ts}`
- `supabase/migrations/042_delete_own_account.sql`
- `supabase/migrations/043_export_user_data.sql`
- `docs/legal/{privacy-policy.md, terms-of-service.md}`
- `src/components/{PrivacyPolicyPage.tsx, TermsPage.tsx}`
- `src/lib/storage/userExport.ts`
- `supabase/queries/in-465-investigation.sql`
- `scripts/{in-465-tmdb-sample.ts, backfill_missing_titles.ts}`
- `docs/v2/investigations/in-465-catalogue-sync-gap.md`
- `docs/v2/phase-summaries/phase-5.5-summary.md`

Plus 30 commits and 2 follow-up commits worth of changes across `src/`, `supabase/functions/`, and the `_shared/` mirror tree.
