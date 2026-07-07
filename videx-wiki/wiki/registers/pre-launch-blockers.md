---
title: Pre-launch blockers
type: register
tags: [register, pre-launch, blockers, launch, security, gdpr]
created: 2026-04-26
updated: 2026-07-06
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md
  - docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.7.md
  - raw/phase-summaries/phase-5.5-summary.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
  - raw/phase-summaries/phase-3-summary.md
  - raw/phase-summaries/phase-4-summary.md
  - docs/v2/phase-summaries/phase-5-summary.md
  - raw/product/privacy-policy-draft.md
  - raw/runbooks/service-role-jwt-rotation.md
  - raw/runbooks/apk-build-and-install.md
  - raw/solutions/supabase-advisor-accepted-warnings.md
related:
  - wiki/registers/parking-lot.md
  - wiki/registers/open-questions.md
  - wiki/concepts/operations/risks-register.md
  - wiki/concepts/product/privacy-and-gdpr.md
---

# Pre-launch blockers

> **2026-07-06:** The approved [Product Strategy & Roadmap v1.0](../sources/strategy-roadmap-2026-07.md) H0 now owns launch sequencing — open items here map to H0 0.1 (item 29 solicitor review, the hard blocker), 0.11 (items 2/4/10/12/13/14 + security IN-PX-29/30) and 0.12 (release mechanics). **Items 15–18 (keystore/signing/version/tag) were closed by the NATIVE-4 cutover + tag-triggered CI release pipeline** — this register predates that and hasn't been row-updated. Item 19 (taste-summary review) and 20 (genre taxonomy) fold into the H0 beta feedback loop (0.7).
>
> **2026-07-06 — H0 Stream D executed** (PR `chore/h0-security-ops`, brief `docs/strategy/briefs/h0-stream-d-security-ops.md`): **closed** items 10 (pg_partman verified healthy), 12 (pricing refreshed), 24/25 (IN-PX-29/30 shipped). **Item 2 (IN-XPS-004) unblocked** — Supabase JWT Signing Keys shipped; now a Joe-owned dashboard rotation ceremony (runbook rewritten). **Item 13** workflow shipped, awaiting Joe's 2 repo secrets. **Items 4 / 13 / 14** and the D1 Play-access check are Joe console actions — see `docs/strategy/briefs/h0-stream-d-console-actions.md`.

Things that **must** be done before the v2 build can ship to real users (beyond the two prototype users). Categorised by stake. Refresh as phases close items. Last reviewed at Phase 5.5 close-out (2026-05-15) — items 5 / 6 / 26 closed; new item 29 (IN-XPS-014 solicitor review) filed as the consolidation of legacy items 7 + 8.

## Security and access control

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 1 | `taste_profiles` RLS policies | Phase 4 security review M1 | Eng | ✅ Closed Phase 5 — migration 036 enabled RLS with `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`. Verified anon SELECT returns 0 rows. |
| 2 | Service-role JWT rotation to Supabase Vault | Parking-lot IN-XPS-004 | Joe (dashboard ceremony) | ⚠→**UNBLOCKED 2026-07-06 (H0 Stream D).** Supabase shipped **JWT Signing Keys** (asymmetric, rotatable; GA mid-2025, projects auto-migrated 1 Oct 2025); legacy JWT keys deprecated end-2026. The May blocker (no path to issue a verifiable JWT) is resolved. Cryptographic rotation is now a live dashboard ceremony (standby → rotate → revoke) — **not automated in the PR** (live credential). Steps in the rewritten [service-role-jwt-rotation runbook](../concepts/operations/service-role-jwt-rotation.md) + console-actions §4. |
| 3 | "Allow public username lookup" RLS tightening on `profiles` | Parking-lot IN-XPS-002 | Eng | ✅ Closed Phase 5 — migration 038 dropped the wide-open policy and replaced with `username_available(check_username text)` SECURITY DEFINER RPC. Anon SELECT on profiles now denied. |
| 4 | Enable Supabase Auth "Prevent use of leaked passwords" | Supabase advisor accepted-warnings note | Joe (dashboard toggle) | ⏳ **Confirmed still disabled** via security advisor 2026-07-06. Zero downside; takes seconds. Toggle steps in console-actions §1. |
| 22 | `verify_jwt = true` codified per Edge Function + CI guard | Phase 5 IN-XPS-011 | Eng | ✅ Closed Phase 5 — six per-function `config.toml` files set `verify_jwt = true`; `.github/workflows/edge-fn-jwt-guard.yml` blocks regressions. |
| 23 | CORS allow-list on user-callable Edge Functions | Phase 5 IN-XPS-013 | Eng | ✅ Closed Phase 5 — `_shared/cors.ts` echoes Origin only when allow-listed (`capacitor://localhost`, `https://localhost`, `^http://localhost(:port)?$`, `VIDEX_ALLOWED_DEV_ORIGINS` env hook). Applied to `render-foryou-rows` and `label-anchor-room`. |
| 24 | `username_available` rate-limit | Parking-lot IN-PX-29 | Eng | ✅ Closed 2026-07-06 (H0 Stream D) — migration `053_username_available_rate_limit.sql`. **In-DB** per-IP fixed-window limit (30/min) inside the SECURITY DEFINER RPC, not gateway: the client calls the RPC directly against PostgREST (never the Worker), so only an in-function limit covers the real path. Fails open when no client IP is attributable. |
| 25 | Defence-in-depth in `extractUserIdFromJwt` (signature verification or `_no_auth_/` runtime assertion) | Parking-lot IN-PX-30 | Eng | ✅ Closed 2026-07-06 (H0 Stream D) — `_shared/userScope.ts` throws if invoked under the reserved `_no_auth_/` namespace (unverified-signature context). Chose the runtime assertion over `jose`+JWKS because JWKS-only verify would reject the project's current legacy-HS256 tokens; that path opens once IN-XPS-004 rotation lands. |

## GDPR / privacy

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 5 | Delete account cascade wiring | Parking-lot IN-XPS-006; Phase 3 summary | Eng | ✅ Closed Phase 5.5 (migration 042 applied 2026-05-15). Defensive belt-and-braces explicit DELETEs across 8 user-scoped tables; C11 throwaway-account smoke test (113 `card_impressions` + 6 onboarding events + profile/taste/services): every count = 0 post-delete; `auth.users` row gone. UI gate flipped with type-username-to-confirm UX. GDPR Article 17 blocker resolved. |
| 6 | Data export (Profile → Privacy & Data → Download my data) | Privacy policy draft §6.3; Parking-lot IN-PX-35 | Eng | ✅ Closed Phase 5.5 (migration 043 applied 2026-05-15). `export_user_data()` SECURITY DEFINER RPC returns `jsonb` keyed by user-scoped table; `card_impressions` capped to last 90 days. Frontend wires `@capacitor/filesystem` Documents directory write on native + Blob download on web. GDPR Article 20 blocker resolved. |
| 7 | Privacy policy counsel review | Privacy policy draft (status: draft) | Joe + counsel | ✅ Consolidated into item 29 (IN-XPS-014) at Phase 5.5 close. |
| 8 | Add controller details, registered address, ICO registration | Privacy policy draft §1 | Joe | ✅ Consolidated into item 29 (IN-XPS-014) — placeholders intentionally left in `docs/legal/*.md` to signal not-launch-ready. |
| 9 | Privacy disclosure copy aligned with Detail Page Signal Spec | Parking-lot IN-XPS-001 | Product | ✅ Closed Phase 5.5 — `docs/legal/privacy-policy.md` §2 mirrors the in-app "What Videx learns" modal verbatim plus DB-level detail; signup-flow spans converted to functional buttons. |
| 26 | Privacy Policy + Terms pages with functional links | Parking-lot IN-PX-34 | Product / Eng | ✅ Closed Phase 5.5 — `docs/legal/{privacy-policy,terms-of-service}.md` authored + rendered via `react-markdown` from `?raw` Vite imports + wired into signup flow + Profile → Privacy & Data sub-page. Both docs carry lawyer-vetting caveat footer (see item 29 for the actual solicitor review). |
| 29 | UK solicitor review of Privacy Policy + Terms of Service | Parking-lot IN-XPS-014 (filed Phase 5.5 close-out 2026-05-15) | Joe + UK solicitor | ⏳ **Hard pre-launch blocker.** Phase 5.5 drafts are descriptive of current Videx behaviour but **have not been reviewed by a qualified UK solicitor**. Required before App Store / Google Play submission. Drafts at `docs/legal/{privacy-policy,terms-of-service}.md`. Joe's decision pre-launch: contact channel (email-only legally sufficient under UK GDPR Article 13(1)(a); postal address optional, advised against using personal home address). Recommended options: registered office address service (~£30-50/yr), Royal Mail PO Box, virtual mailbox. |

## Operational hardening

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 10 | Verify pg_partman automatic monthly partition creation after first month tick-over | Parking-lot IN-XPS-003 | Eng | ✅ Closed 2026-07-06 (H0 Stream D) — verified healthy. `part_config`: 1-mon interval, premake 2, 3-mon retention (drops tables), auto-maintenance on; partitions p20260401→p20260901 present (older dropped). `pg_partman_maintenance` (02:00) + `card_impressions_rollup` (01:00) crons both `succeeded`. `card_impression_daily_totals` empty **by design** (rollup only aggregates rows >90d old; earliest impression 2026-06-15 → correctly no-ops until ~mid-Sept 2026). Spot-check totals after first data crosses 90d. |
| 11 | Phase 5 contextual scorer | Phase 4 summary; risks register | Joe | ✅ Closed Phase 5 — `contextual.ts` ships real three-component scorer (time-of-day 40% / viewing-context 40% / device 20%); MMR diversity replaces `applyGenreSpread` for For You; `BASE_WEIGHTS` 62.5/25/12.5 unchanged pending prototype-vector rebase. |
| 12 | Service pricing config refresh cadence | Parking-lot IN-XPS-007 | Product | ✅ Closed 2026-07-06 (H0 Stream D) — `platformPricing.ts` refreshed vs July-2026 UK prices (Netflix/Disney+/Apple TV/Paramount+ 3-tier/Prime standalone/NOW+Sky restructure; Sky Go now bundle-only). Next quarterly review ~Oct 2026. |
| 13 | Supabase Pro backup off-site copy (monthly `pg_dump`) | Risks register R-015; supabase-backup-restore runbook | Eng + Joe (secret) | ⚠ 2026-07-06 (H0 Stream D) — workflow `.github/workflows/db-backup.yml` shipped (monthly encrypted `pg_dump` → GitHub artifact); reuses existing `SUPABASE_CONNECTION_STRING`. **Blocked on Joe adding 1 repo secret** (`BACKUP_GPG_PASSPHRASE`) + one manual run — console-actions §2. |
| 14 | Mirror remote (GitLab) for Git redundancy | Project Orchestration v0.3.3 §8.2 | Joe | ⏳ 2026-07-06 (H0 Stream D) — three options documented (console-actions §3); Joe to pick, then Eng wires the automated push variant. |
| 27 | `foryou-parity` CI workflow secrets configured | Parking-lot IN-XPS-012 + IN-PX-33 | Eng | ✅ Closed Phase 5.5 (activated 2026-05-15). All 5 `PARITY_*` GitHub secrets configured for `is_test_user = true` profile (UUID `3719d29e-…`). Property-level golden seeded in `scripts/test/foryou-parity-golden.json` (6,083 bytes, 73 items across 8 sections). Workflow now hard-fails on Edge / client divergence on any PR touching `recommendations-v2/**`. |

## Build / release prerequisites

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 15 | Generate Android release keystore and store securely + backed up | apk-build-and-install runbook | Joe | ⏳ Pre-launch task. Never commit keystore. |
| 16 | Populate `signingConfigs.release` in `android/app/build.gradle` | apk-build-and-install runbook | Eng | ⏳ Pre-launch task. |
| 17 | Bump `versionCode` (integer monotonic) and `versionName` (semver) before release | apk-build-and-install runbook | Eng | ⏳ Pre-each-release task. |
| 18 | Tag the release commit (`git tag v0.x.y && git push origin v0.x.y`) | apk-build-and-install runbook | Eng | ⏳ Pre-each-release task. |

## UX / product

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 19 | Auto-generated taste summary quality (qualitative review of LLM-generated summaries) | Strategy v1.6.3 §8.2 #6 | Product | ⏳ Pre-launch. |
| 20 | Genre taxonomy validation | Strategy §8.2 #7; IN-OB-001 | Product | ⏳ Final taxonomy reviewed during implementation; not yet incorporated. |

## Process

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 21 | Phase 4.5 end-of-phase summary doc | Phase summaries source page (gap noted) | Joe / Eng | ✅ Closed 2026-04-27 by [phase-4-and-4.5-summary.md](../../../docs/v2/phase-summaries/phase-4-and-4.5-summary.md). |
| 28 | Phase 5 end-of-phase summary doc | Phase 5 close-out 2026-05-07 | Joe / Eng | ✅ Closed by [phase-5-summary.md](../../../docs/v2/phase-summaries/phase-5-summary.md). |
| 30 | Phase 5.5 end-of-phase summary doc | Phase 5.5 close-out 2026-05-15 | Joe / Eng | ✅ Closed by [phase-5.5-summary.md](../../../docs/v2/phase-summaries/phase-5.5-summary.md). Also: parking lot v0.6 → v0.7, orchestration v0.7 actuals note, wiki ingest. |

## Soft items (worth doing but not strictly blockers)

- `<Database>` generic on Supabase client — ✅ enabled Phase 5; per-file null guards landed for the six 47-error files.
- Availability page-count adaptive strategy (`getAvailableTmdbIds` fires 20 parallel pages unconditionally; will silently truncate at 100K+ titles).
- `getAvailableTmdbIds` does not distinguish by `media_type` (IN-458) — re-targeted to Phase 6.
- Director extraction widening (IN-PX-06) — only if a future template revision adds director.
- Embedding fetch caching (IN-PX-22), MMR partial-coverage fallback (IN-PX-23), Float32Array precompute (IN-PX-24) — ✅ all closed Phase 5.5.
- Edge `_shared/database.types.ts` regen (IN-PX-52) and CI check for user-scoped tables in `delete_own_account` + `export_user_data` (IN-PX-54) — Phase 5.5 review-pass follow-ups for Phase 6.

## Counts

| Category | Open | Done |
|---|---|---|
| Security and access control | 2 | 6 |
| GDPR / privacy | 1 | 5 |
| Operational hardening | 2 | 4 |
| Build / release prerequisites | 4 | 0 |
| UX / product | 2 | 0 |
| Process | 0 | 3 |
| **Total** | **11** | **18** |

> Counts refreshed 2026-07-06 (H0 Stream D closed items 10/12/24/25; item 2 unblocked-but-Joe-owned still counted open; item 13 partial-Joe counted open). Build/release 15–18 remain listed open per the pre-NATIVE-4 convention above (functionally closed by the CI release pipeline).

## How to use this register

Treat as a launch checklist. Item 29 (solicitor review) is the highest-stake remaining blocker — App Store / Play Store explicitly reject apps without lawyer-vetted privacy disclosures for non-prototype user bases. Items 15-18 (release builds) are sequencing-dependent and only meaningful when ready to ship. Run through the whole list at the v2 → public-launch boundary.

Phase 5 closed items 1, 3, 11, 22, 23 (security hardening) and 28 (process). **Phase 5.5 closed items 5, 6, 9, 26, 27, 30** (legal-disclosures cluster + parity probe activation + process). Item 29 is the new pre-launch blocker filed at Phase 5.5 close.
