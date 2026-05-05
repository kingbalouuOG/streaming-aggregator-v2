---
title: Pre-launch blockers
type: register
tags: [register, pre-launch, blockers, launch, security, gdpr]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
  - raw/phase-summaries/phase-3-summary.md
  - raw/phase-summaries/phase-4-summary.md
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

Things that **must** be done before the v2 build can ship to real users (beyond the two prototype users). Categorised by stake. Refresh as phases close items.

## Security and access control

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 1 | `taste_profiles` RLS policies | Phase 4 security review M1 | Eng | ⏳ Migration 033+ planned. GDPR / privacy blocker. Pre-existing gap, not introduced by Phase 4. |
| 2 | Service-role JWT rotation to Supabase Vault | Parking-lot IN-XPS-004 | Eng | ⏳ Currently inlined into pg_cron job definitions. Vault migration documented in [service-role-jwt-rotation runbook](../concepts/operations/service-role-jwt-rotation.md). |
| 3 | "Allow public username lookup" RLS tightening on `profiles` | Parking-lot IN-XPS-002 | Eng | ⏳ Flagged, not yet scheduled. Wider than necessary. |
| 4 | Enable Supabase Auth "Prevent use of leaked passwords" | Supabase advisor accepted-warnings note | Joe (dashboard toggle) | ⏳ Zero downside; takes seconds. |

## GDPR / privacy

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 5 | Delete account cascade wiring | Parking-lot IN-XPS-006; Phase 3 summary | Eng | ⏳ UI exists, button disabled with "not yet available" notice. GDPR Article 17 blocker. |
| 6 | Data export (Profile → Privacy & Data → Download my data) | Privacy policy draft §6.3 | Eng | ⏳ Wiring deferred. GDPR Article 15 blocker. |
| 7 | Privacy policy counsel review | Privacy policy draft (status: draft) | Joe + counsel | ⏳ Policy text reflects current data handling; needs lawyer sign-off. |
| 8 | Add controller details, registered address, ICO registration | Privacy policy draft §1 | Joe | ⏳ Pre-launch placeholder content. |
| 9 | Privacy disclosure copy aligned with Detail Page Signal Spec | Parking-lot IN-XPS-001 | Product | ⏳ Not yet incorporated. |

## Operational hardening

| ID | Item | Source | Owner | Status |
|---|---|---|---|---|
| 10 | Verify pg_partman automatic monthly partition creation after first month tick-over | Parking-lot IN-XPS-003 | Eng | ⏳ Scheduled post-Phase-0 verification (event trigger from migration 016 should make this a non-issue, but verify). |
| 11 | Phase 5 contextual scorer (decide: ship before launch or defer) | Phase 4 summary; risks register open question | Joe | ⏳ Open. Phase 4 ships placeholder returning 0.5; Phase 5 replaces. When Phase 5 ships, re-evaluate 62.5/25/12.5 weight split. |
| 12 | Service pricing config refresh cadence | Parking-lot IN-XPS-007 | Product | ⏳ Last verified April 2026 (`platformPricing.ts`). Quarterly review or external data source. |
| 13 | Supabase Pro backup off-site copy (monthly `pg_dump`) | Risks register R-015; supabase-backup-restore runbook | Eng | ⏳ Pre-launch recommended. |
| 14 | Mirror remote (GitLab) for Git redundancy | Project Orchestration v0.3.3 §8.2 | Eng | ⏳ Pre-launch recommended. |

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
| 21 | Phase 4.5 end-of-phase summary doc | Phase summaries source page (gap noted) | Joe / Eng | ✅ Closed 2026-04-27 by [phase-4-and-4.5-summary.md](../../../docs/v2/phase-summaries/phase-4-and-4.5-summary.md) — combined Phase 4 + 4.5 (Gates 1–4 + redirect) wrap-up. |

## Soft items (worth doing but not strictly blockers)

- Consolidate v1 `watched`/`removed` event types with v2 `marked_watched`/`watchlist_remove` (IN-PX-02; CHECK constraint accepts both today).
- `<Database>` generic on Supabase client (47 pre-existing errors across 6 out-of-scope files; full cleanup deferred Phase 5/6).
- Availability page-count adaptive strategy (`getAvailableTmdbIds` fires 20 parallel pages unconditionally; will silently truncate at 100K+ titles).
- `getAvailableTmdbIds` does not distinguish by `media_type` (IN-458).
- Director extraction widening (IN-PX-06) — only if a future template revision adds director.

## Counts

| Category | Open | Done |
|---|---|---|
| Security and access control | 4 | 0 |
| GDPR / privacy | 5 | 0 |
| Operational hardening | 5 | 0 |
| Build / release prerequisites | 4 | 0 |
| UX / product | 2 | 0 |
| Process | 0 | 1 |
| **Total** | **20** | **1** |

## How to use this register

Treat as a launch checklist. Items 1, 2, 3, 5, 6 are the highest-stake (security + GDPR). Items 15-18 (release builds) are sequencing-dependent and only meaningful when ready to ship. Run through the whole list at the v2 → public-launch boundary.
