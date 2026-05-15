# Privacy Policy

**Last updated:** 2026-05-14
**Effective from:** [date of first non-prototype release — TBC]

## 1. Who we are

Videx is a personal viewing-recommendation app for UK streaming
services. The app is currently a private prototype built by a single
developer, Joe Green, as the data controller under UK GDPR.

**Contact:** [your-contact-email-address — TBC]
**Postal address:** [your-UK-postal-address — TBC]

If you have any questions about how Videx handles your data, or you
want to exercise any of the rights described in §6, write to the
address or email above and Joe will respond within 30 days.

## 2. What data we collect

When you create an account and use the app, Videx stores the
following data in the database tables listed:

- **Account record** (`profiles`): your username, your UK region, your
  theme preference, the viewing context you picked at onboarding
  (solo / with partner / with family / with friends / wind down /
  background / focused), your age range, and whether you finished the
  onboarding flow.
- **Interaction history** (`user_interactions`): every thumbs up,
  thumbs down, watched mark, watchlist add, dismiss, service tap,
  detail-page view, and time-on-detail-page reading you do in the
  app — each stamped with the content's TMDb id and the time you did
  it.
- **Impression log** (`card_impressions`): which titles surfaced in
  front of you, in which row, in what position, at what time, and
  with what context (mood-room anchor metadata, etc.). Rolled up to
  daily aggregates after 90 days; see §7.
- **Taste profile** (`taste_profiles`): a 1,536-dimensional taste
  vector computed locally from your interaction history, plus the
  four slider positions (catalogue age, comfort zone, content mix,
  variety) you set on the For You page.
- **Service selections** (`user_services`): which UK streaming
  services you've told Videx you subscribe to.
- **Genre cluster picks** (`user_genres`): the taste clusters you
  selected at onboarding.
- **Watchlist** (`watchlist`): titles you've saved to watch later.
- **Onboarding analytics** (`onboarding_events`): which steps of the
  onboarding flow you reached, used internally to debug drop-off.

We never collect any of: your location, anything happening in other
apps on your device, what you actually watch on the streaming
services themselves, your photos, contacts, or any biometric data.

## 3. Where your data is stored

All of the data above is stored in a Supabase project hosted in
London, UK (eu-west-2). The project runs on Supabase's Pro tier
which includes point-in-time recovery and 7-day automatic backups.
Joe (the data controller) is the only person with administrative
access to the project; Supabase as a sub-processor has the access
described in their UK data-processing addendum.

Your data does not leave the UK except for the third-party API
traffic described in §4.

## 4. Third parties

Videx queries a small number of external APIs to enrich the title
catalogue. The flows below describe what leaves the project and what
does NOT.

- **The Movie Database (TMDb), themoviedb.org.** Videx queries TMDb
  for film and TV metadata (titles, posters, cast, genre IDs,
  release dates). Only catalogue identifiers and search queries flow
  to TMDb. **No user PII is sent — TMDb cannot see who you are.**
- **OMDb, omdbapi.com.** Same shape: catalogue enrichment only,
  no PII.
- **Streaming Availability API via RapidAPI** (moviesofthenight.com).
  Videx queries this API to learn which UK streaming services
  currently carry which titles, and to fetch deep-link URLs.
  Catalogue identifiers only, no PII.
- **OpenAI.** Videx uses OpenAI's `text-embedding-3-small` and
  `gpt-4o-mini` models during scheduled catalogue-maintenance jobs
  to (a) compute title-similarity embeddings and (b) generate
  thematic labels for "If you love X" recommendation rooms. **These
  jobs run server-side against the catalogue, not in your session.
  No user data flows to OpenAI — only title text (name + synopsis +
  cast).** Your taste vector is computed locally from your
  interaction history; OpenAI never sees it.

Each of the above is contracted under their public terms of service.
None of them act as joint controllers for the data described in §2.

## 5. What we don't do

To make this absolutely concrete, Videx does NOT:

- run any third-party advertising network or share data with one
- track your activity outside the Videx app
- request or store your location
- train any machine-learning model on your interaction history
  (the taste vector is a deterministic projection, not a trained
  model)
- sell or barter your data with any other party
- store payment information (the app is free during prototype use)

## 6. Your rights

Under UK GDPR you have the following rights over your data. Each is
exposed in the app:

- **Right to access.** You can see every piece of data Videx holds
  about you by opening Profile → Settings → Privacy & Data →
  Download my data — see §6.3.
- **Right to deletion (right to be forgotten).** Profile → Settings
  → Privacy & Data → Delete my account permanently removes your
  account record and every row of data described in §2 within
  seconds. The deletion is irreversible.
- **Right to data portability.** Profile → Settings → Privacy &
  Data → Download my data returns a single JSON file containing
  every row of data described in §2, in machine-readable form. You
  can take this to any other recommendation service that accepts
  it.
- **Right to rectification.** You can update your profile details
  (region, viewing context, age range) from Profile → Settings at
  any time. To change your username, email Joe at the address in
  §1.
- **Right to restrict / object to processing.** Write to Joe at the
  address in §1 to discuss specific concerns — there are no
  automated decisions made about you within the app that produce
  legal effects.
- **Right to complain to the ICO.** If you think Videx has
  mishandled your data, you can complain to the UK Information
  Commissioner's Office at <https://ico.org.uk/make-a-complaint/>.

## 7. How long we keep your data

- **`card_impressions` rows older than 90 days are rolled up into
  daily aggregates and the original rows are deleted.** This is an
  automatic database job; nothing you do triggers it.
- All other tables described in §2 persist until you delete your
  account.

If you sign up and never come back, your data persists indefinitely
until you delete it. We do not auto-prune inactive accounts.

## 8. Cookies and local storage

Videx is a Capacitor-based Android app and does not set browser
cookies. It does use the device's local storage for:

- Theme preference (so the app remembers light/dark mode).
- A 24-hour cache of title embeddings, scoped to your user account,
  to speed up recommendation re-ranking when you change a slider.
  This cache is cleared every time you sign out.
- An in-memory buffer for the interaction events described in §2
  before they're flushed to the server.

None of these are used for tracking.

## 9. Children

Videx is not directed at children under 13 and we don't knowingly
collect data from anyone in that age range. If you become aware
that a child under 13 has signed up, please contact Joe and the
account will be deleted.

## 10. Changes to this policy

If we materially change how Videx handles your data, we'll update
this document and notify signed-in users via the app at least 30
days before the change takes effect. Non-material changes
(rewording for clarity, fixing typos) may happen without
notification.

## 11. Contact

Questions, exercising rights, or complaints — write to:

- Email: [your-contact-email-address — TBC]
- Post:  [your-UK-postal-address — TBC]

For a regulatory complaint, contact the UK Information
Commissioner's Office: <https://ico.org.uk/make-a-complaint/>.

---

*Draft v1, descriptive of current Videx behaviour as of 2026-05-14.
Authored by Claude under Joe's review. **This document has not
been reviewed by a qualified UK solicitor.** Solicitor review is
required before App Store / Google Play submission and before any
non-prototype user base accesses the product. Treat this draft as
a working document that captures current technical reality, not
as a legally-vetted disclosure. Tracked as IN-XPS-014 — UK
solicitor review of Privacy Policy + Terms of Service.*
