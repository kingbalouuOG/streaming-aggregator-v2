---
title: Privacy Policy Draft
generated: 2026-04-26
status: draft — legal review required pre-launch
sources: [docs/v2/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md §1.2-1.3]
---

# Privacy Policy (Draft)

> **Draft for legal review.** Reflects current data handling. Must be reviewed by counsel before launch.

## Who we are

Videx is a UK-based streaming aggregator. Controller details, registered address, and ICO registration to be added pre-launch.

## What data we collect

### Account

- Email address (for sign-in and account recovery).
- Username (chosen by you).
- Authentication credentials (hashed password, managed by Supabase).

### Profile

- Region (defaulted to GB).
- Theme preference.
- Age range and viewing context (optional, captured during onboarding).
- The streaming services you subscribe to.

### Behavioural signals

We learn what you like by tracking how you interact with content. Specifically:

- **Explicit signals:** thumbs up / thumbs down, watchlist add / remove, mark as watched, "Not Interested", availability reports.
- **Silent signals:** detail page visits, dwell time on detail pages, deep-link clicks (and whether they reached the streaming app), section expansions, scroll depth, back-navigation speed.
- **Impressions:** which cards we showed you, on which surface, in what position. Stored separately from interaction events.
- **Session metadata:** anonymous session ID (resets after 5 minutes of inactivity), source surface tags.

We do **not** track:

- Location beyond the country level (region).
- Device identifiers across apps.
- Anything you watch outside Videx.

## How we use it

- Personalising recommendations on the For You and Home surfaces.
- Generating Mood Rooms (anonymised, aggregated across users via offline clustering).
- Diagnosing bugs and improving the app.
- Enforcing the Critically Acclaimed gating rule (aggregate OMDB coverage, no per-user logic).

## Where data lives

- Supabase (Postgres) hosted in EU-West-2 (London).
- OpenAI is used to generate embeddings of titles, **not** of any user data. Your taste vector is computed locally to Supabase from titles' embeddings; OpenAI never receives user-specific information.

## Sharing

We do not share personal data with advertisers. We surface third-party content metadata (TMDb, OMDB, Streaming Availability API) under their respective terms; deep links pass control to the streaming app.

## Your rights (UK GDPR)

- **Access:** request a copy of your data via Profile → Data export (planned pre-launch).
- **Erasure:** delete your account from Profile → Account → Delete account. Cascade removes all interactions, impressions, and profile data.
- **Rectification:** edit profile fields directly.
- **Portability:** data export is JSON format.
- **Objection / restriction:** raise via support email.

## Retention

- Active accounts: data retained for the life of the account.
- After deletion: cascade removal within 30 days (Supabase backup retention window).
- Impressions older than 12 months: aggregated into `card_impression_daily_totals` and detail rows dropped from monthly partitions.

## Cookies and trackers

The Capacitor-wrapped app does not use third-party tracking SDKs. No analytics SDK, no ad tracking, no fingerprinting.

## Changes

This policy will be updated as the product evolves. Material changes notified in-app.

## Contact

[Email address to be added pre-launch.]
