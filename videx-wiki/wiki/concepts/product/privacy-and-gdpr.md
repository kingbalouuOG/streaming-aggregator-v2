---
title: Privacy and GDPR
type: concept
tags: [privacy, gdpr, draft, legal]
created: 2026-04-26
updated: 2026-09-08
sources:
  - raw/product/privacy-policy-draft.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
related:
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/concepts/operations/service-role-jwt-rotation.md
---

# Privacy and GDPR

> Draft. Reflects current data handling. Must be reviewed by counsel before launch.

## Lawful basis

Legitimate interest. Signals are necessary to provide the core product feature (personalised recommendations).

Required:

1. Clear privacy notice explaining what's collected and why.
2. User ability to object (account deletion or explicit opt-out).
3. Signal minimisation.
4. Reasonable retention periods.

## What we collect

### Account

- Email (sign-in, recovery).
- Username.
- Authentication credentials (hashed by Supabase).

### Profile

- Region (default GB).
- Theme preference.
- Age range and viewing context (optional).
- Subscribed services.

### Behavioural signals

- **Explicit**: thumbs ±, watchlist add/remove, mark watched, "Not Interested", availability reports.
- **Silent**: detail-page visits, dwell time, deep-link clicks (with confidence), section expansions, scroll depth, back-navigation speed.
- **Impressions**: which cards shown, on which surface, in what position. Stored separately in `card_impressions`.
- **Search**: the words typed into search, or the mood card tapped, plus how many results came back. Settled queries only — one row per query, never per keystroke. See [signal-architecture](../architecture/signal-architecture.md#search-events).
- **Session metadata**: anonymous session ID (resets after 5 minutes background), source surface tags.

## What we do NOT capture

- Location beyond country level (region).
- Cross-app device identifiers.
- Anything you watch outside Videx.
- Third-party advertising identifiers.
- Microphone, camera, contacts.
- Keystroke or input tracking outside explicit forms.

## How we use it

- Personalising recommendations on For You and Home.
- Generating Mood Rooms (anonymised, aggregated, offline clustering).
- Diagnosing bugs and improving the app.
- Aggregate OMDB coverage check for Critically Acclaimed gating (no per-user logic).

## Where data lives

- Supabase (Postgres) hosted in EU-West-2 (London).
- OpenAI is used to generate embeddings of titles, **not** of any user data. The taste vector is computed from titles' embeddings server-side; OpenAI never receives user-specific information.

## User rights (UK GDPR)

- **Access (Article 15)**: data export via Profile → Privacy & Data → Download my data (JSON), backed by `export_user_data()` (migrations 043/061). Live. Verified 2026-09-08 to include `search` rows with their full metadata.
- **Erasure (Article 17)**: delete account from Profile → Privacy & Data → Delete my account, backed by `delete_own_account()` (migration 042). Cascade hard-delete across all user-scoped tables. Live. Verified 2026-09-08 to remove `search` rows.
- **Rectification**: edit profile fields directly.
- **Portability (Article 20)**: same export as access, JSON format.
- **Objection / restriction**: support email.

## Retention

| Class | Retention |
|---|---|
| Active users | Lifetime of account. |
| Inactive (>18 months no login) | Soft-delete interactions older than 12 months; retain taste vector and watchlist. |
| Deleted accounts | Immediate hard delete across all user-scoped tables. |
| `card_impressions` row-level | 90 days, then aggregated to `card_impression_daily_totals` and partition dropped. |
| `user_interactions` search **text** | **30 days** (migration 079, nightly `search_terms_rollup` at 03:00 UTC). `metadata.query` is nulled; the row itself is kept, because the search-attribution recompute needs its `created_at` + `session_id` and nothing else in it is free text. Counts survive in `search_terms_daily` (day, term, mode, count, median result count) — **no user column**, so it is exempt from `delete_own_account`/`export_user_data` and kept indefinitely. |
| Children's data (UK <13) | Should not exist; no child accounts in v2. |

## Known gap: the §10 change-notification promise

Privacy policy §10 promises to "notify signed-in users via the app at least 30 days before the change takes effect". **Nothing in the app implements this.** Verified 2026-09-08: the policy is a static string (`native/src/legal/policyContent.ts`) rendered on demand from onboarding and Profile → Privacy. There is no stored policy version (no column on `profiles`, no consent table), no changelog surface, and no in-app notice. The push transport from [notifications-v1](../architecture/notifications-v1.md) exists but is blocked on FCM/APNs credentials and carries recommendations, not legal notices. Filed in the parking lot.

## Cookies and trackers

Capacitor-wrapped app does not use third-party tracking SDKs. No analytics SDK, no ad tracking, no fingerprinting.

## Pre-launch blockers

- `taste_profiles` RLS missing (Phase 4 security review M1; migration 033+ planned).
- Data export wiring (IN-XPS-006).
- Delete account cascade wiring (IN-XPS-006).
- Service-role JWT rotation to Supabase Vault (IN-XPS-004).
- Counsel review of policy text.

## Disclosures

- **Onboarding**: brief modal — "Videx learns from what you watch, rate, and explore… you can see and delete your data anytime from your profile."
- **Privacy policy**: full disclosure, accessible from Profile → Settings → Privacy.
- **In-product**: Profile → Settings → "What Videx learns from you" page translating signals list into user-facing language.
