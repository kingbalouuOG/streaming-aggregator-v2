# Privacy Policy

**Last updated:** 7 July 2026
**Effective from:** 6 July 2026

## 1. Who we are

Videx is a personal viewing-recommendation app for UK streaming
services. It is built and operated by a single developer, Joe Green,
based in the United Kingdom, who is the data controller under UK GDPR.

**Contact:** privacy@videx.app

If you have any questions about how Videx handles your data, or you
want to exercise any of the rights described in §6, email the address
above and Joe will respond within 30 days.

## 2. What data we collect

When you create an account and use the app, Videx stores the
following data in the database tables listed:

- **Account record** (`profiles`): your username, your UK region, your
  theme preference, the viewing context you picked at onboarding
  (solo / with partner / with family / with friends / wind down /
  background / focused), your age range, and whether you finished the
  onboarding flow.
- **Interaction history** (`user_interactions`): every thumbs up,
  thumbs down, watched mark, watchlist add, dismiss, detail-page view,
  and time-on-detail-page reading you do in the app — each stamped
  with the content's TMDb id and the time you did it. This also
  includes your **click-outs**: when you tap through to a streaming
  service to watch something, Videx records which service you tapped,
  whether it sent you to an exact title link or to a search page, and
  the rent or buy price (if any) that was shown on screen at the
  moment you tapped.
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
- **Interest centroids** (`user_interest_centroids`): up to three
  derived "sub-taste" vectors, computed from your interaction history
  the same deterministic way as the main taste vector above.
- **App feedback** (`app_feedback`): any feedback you choose to submit
  through the in-app feedback form.
- **Feature flags** (`user_feature_flags`): per-account flags that
  turn experimental features on or off for you.

We never collect any of: your location, anything happening in other
apps on your device, what you actually watch on the streaming
services themselves, your photos, contacts, or any biometric data.

### Push notifications

If you opt in to push alerts (a title on your watchlist arriving on
one of your services, or leaving one soon), Videx additionally
stores:

- **Push token** (`user_push_tokens`): an identifier issued by the
  device push service (Google FCM / Apple APNs, relayed via Expo's
  push service), used only to deliver the alerts you opted into,
  along with your platform (Android / iOS) and minimal device
  metadata — an app-install identifier, an optional coarse device
  label (e.g. "Pixel 7"), and the app version. No advertising IDs,
  no location, no hardware fingerprint. The token is cleared when
  you sign out, and dead tokens are pruned automatically by the
  delivery pipeline.
- **Notification preferences** (`notification_preferences`): your
  per-type on/off choices (arrivals, leaving-soon).
- **Delivery log** (`notification_deliveries`): which alert was sent
  to you for which title, kept so the same title never alerts you
  twice and to enforce the daily alert cap.

Consent is asked for after your first value moment in the app (your
first watchlist add) — never at first launch — and you can withdraw
it at any time in Profile → Settings, by revoking the notification
permission in your device settings, or by signing out. Your choices
are enforced server-side: the daily alert job filters on your
consent, not just the client.

Push delivery passes the push token and the alert text (the title
name and a short availability line) — nothing more — to Expo's push
service and on to Apple APNs / Google FCM for delivery.

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

Questions, exercising rights, or complaints — email us:

- Email: privacy@videx.app

For a regulatory complaint, contact the UK Information
Commissioner's Office: <https://ico.org.uk/make-a-complaint/>.

---

*Videx is operated by Joe Green as an individual data controller based
in the United Kingdom. This page describes how the app actually handles
your data; if that changes, we update this page and (per §10) notify
signed-in users. Last updated 7 July 2026.*
