---
title: Pre-launch blockers
type: register
tags: [register, pre-launch, blockers, launch, security, gdpr]
created: 2026-04-26
updated: 2026-05-07
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md
  - docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.6.md
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

Things that **must** be done before the v2 build can ship to real users (beyond the two prototype users). Categorised by stake. Refresh as phases close items. Last reviewed at Phase 5 close-out (2026-05-07).

## Security and access control

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 1 | `taste_profiles` RLS policies | Phase 4 security review M1 | Eng | ✅ Closed Phase 5 — migration 036 enabled RLS with `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`. Verified anon SELECT returns 0 rows. |
| 2 | Service-role JWT rotation to Supabase Vault | Parking-lot IN-XPS-004 | Eng | ⚠ Partial — Phase 5 migration 039 moved JWT into Vault (storage migration). **Same JWT value remains.** Cryptographic rotation deferred to Phase 6+ pending Supabase JWT-format secret keys (current `sb_secret_…` opaque tokens fail `verify_jwt = true` on Edge Functions). See [service-role-jwt-rotation runbook](../concepts/operations/service-role-jwt-rotation.md). |
| 3 | "Allow public username lookup" RLS tightening on `profiles` | Parking-lot IN-XPS-002 | Eng | ✅ Closed Phase 5 — migration 038 dropped the wide-open policy and replaced with `username_available(check_username text)` SECURITY DEFINER RPC. Anon SELECT on profiles now denied. |
| 4 | Enable Supabase Auth "Prevent use of leaked passwords" | Supabase advisor accepted-warnings note | Joe (dashboard toggle) | ⏳ Zero downside; takes seconds. |
| 22 | `verify_jwt = true` codified per Edge Function + CI guard | Phase 5 IN-XPS-011 | Eng | ✅ Closed Phase 5 — six per-function `config.toml` files set `verify_jwt = true`; `.github/workflows/edge-fn-jwt-guard.yml` blocks regressions. |
| 23 | CORS allow-list on user-callable Edge Functions | Phase 5 IN-XPS-013 | Eng | ✅ Closed Phase 5 — `_shared/cors.ts` echoes Origin only when allow-listed (`capacitor://localhost`, `https://localhost`, `^http://localhost(:port)?$`, `VIDEX_ALLOWED_DEV_ORIGINS` env hook). Applied to `render-foryou-rows` and `label-anchor-room`. |
| 24 | `username_available` rate-limit at gateway | Parking-lot IN-PX-29 | Eng | ⏳ Filed Phase 5.5; defence against username enumeration once a public web origin exists. |
| 25 | Defence-in-depth in `extractUserIdFromJwt` (signature verification or `_no_auth_/` runtime assertion) | Parking-lot IN-PX-30 | Eng | ⏳ Filed Phase 5.5. |

## GDPR / privacy

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 5 | Delete account cascade wiring | Parking-lot IN-XPS-006; Phase 3 summary | Eng | ⏳ Re-targeted to Phase 5.5. RPC + client wiring already exist in production; UI gate (disabled button at `ProfilePage.tsx:887-893`), RPC body audit, version-controlled migration (`041_delete_own_account.sql`), and type-username-to-confirm flow are the gaps. GDPR Article 17 blocker. |
| 6 | Data export (Profile → Privacy & Data → Download my data) | Privacy policy draft §6.3; Parking-lot IN-PX-35 | Eng | ⏳ Re-targeted to Phase 5.5. Current implementation is a fake-success toast (`ProfilePage.tsx:771`) — actively misleading. Needs `export_user_data()` RPC + sync-Blob client download. GDPR Article 20 blocker. |
| 7 | Privacy policy counsel review | Privacy policy draft (status: draft) | Joe + counsel | ⏳ Policy text reflects current data handling; needs lawyer sign-off. |
| 8 | Add controller details, registered address, ICO registration | Privacy policy draft §1 | Joe | ⏳ Pre-launch placeholder content. |
| 9 | Privacy disclosure copy aligned with Detail Page Signal Spec | Parking-lot IN-XPS-001 | Product | ⚠ Partial — in-app "What Videx learns" modal at `ProfilePage.tsx:814-836` is app-specific and accurate. Signup-flow Privacy Policy / Terms links at `OnboardingFlow.tsx:636-637` are non-functional `<span>` elements; needs functional pages — see item 26. |
| 26 | Privacy Policy + Terms pages with functional links | Parking-lot IN-PX-34 | Product / Eng | ⏳ Re-targeted to Phase 5.5. Author `docs/legal/privacy-policy.md` + `docs/legal/terms-of-service.md`, render via `PrivacyPolicyPage.tsx` / `TermsPage.tsx`, wire signup-flow spans to clickable routes. **Store-rejection risk** (Apple/Google review explicitly check). |

## Operational hardening

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 10 | Verify pg_partman automatic monthly partition creation after first month tick-over | Parking-lot IN-XPS-003 | Eng | ⏳ Scheduled post-Phase-0 verification. |
| 11 | Phase 5 contextual scorer | Phase 4 summary; risks register | Joe | ✅ Closed Phase 5 — `contextual.ts` ships real three-component scorer (time-of-day 40% / viewing-context 40% / device 20%); MMR diversity replaces `applyGenreSpread` for For You; `BASE_WEIGHTS` 62.5/25/12.5 unchanged pending prototype-vector rebase. |
| 12 | Service pricing config refresh cadence | Parking-lot IN-XPS-007 | Product | ⏳ Last verified April 2026 (`platformPricing.ts`). Quarterly review or external data source. |
| 13 | Supabase Pro backup off-site copy (monthly `pg_dump`) | Risks register R-015; supabase-backup-restore runbook | Eng | ⏳ Pre-launch recommended. |
| 14 | Mirror remote (GitLab) for Git redundancy | Project Orchestration v0.3.3 §8.2 | Eng | ⏳ Pre-launch recommended. |
| 27 | `foryou-parity` CI workflow secrets configured | Parking-lot IN-XPS-012 | Eng | ⏳ Workflow file added Phase 5; soft-skips when secrets absent. Configure `PARITY_USER_JWT`, `PARITY_USER_ID`, `PARITY_SERVICES`, `PARITY_SUPABASE_URL`, `PARITY_SUPABASE_SERVICE_ROLE_KEY` for a `is_test_user = true` profile to enforce. |

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

## Soft items (worth doing but not strictly blockers)

- `<Database>` generic on Supabase client — ✅ enabled Phase 5; per-file null guards landed for the six 47-error files.
- Availability page-count adaptive strategy (`getAvailableTmdbIds` fires 20 parallel pages unconditionally; will silently truncate at 100K+ titles).
- `getAvailableTmdbIds` does not distinguish by `media_type` (IN-458) — re-targeted to Phase 5.5 (additive `get_available_tmdb_id_pairs`).
- Director extraction widening (IN-PX-06) — only if a future template revision adds director.
- Embedding fetch caching (IN-PX-22), MMR partial-coverage fallback (IN-PX-23), Float32Array precompute (IN-PX-24) — performance polish filed for Phase 5.5.

## Counts

| Category | Open | Done |
|---|---|---|
| Security and access control | 3 | 3 |
| GDPR / privacy | 5 | 0 |
| Operational hardening | 5 | 1 |
| Build / release prerequisites | 4 | 0 |
| UX / product | 2 | 0 |
| Process | 0 | 2 |
| **Total** | **19** | **6** |

## How to use this register

Treat as a launch checklist. Items 1, 5, 6, 26 are the highest-stake (security + GDPR + store-rejection risk). Items 15-18 (release builds) are sequencing-dependent and only meaningful when ready to ship. Run through the whole list at the v2 → public-launch boundary.

Phase 5 closed items 1, 3, 11, 22, 23 (security hardening) and 28 (process). Items 5, 6, 26 are the legal-disclosures cluster scheduled for Phase 5.5.
