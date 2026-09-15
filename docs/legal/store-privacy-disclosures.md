# Videx — store data-safety disclosure answers

**For:** Google Play Data Safety form + Apple App Privacy labels. Copy from here; keep consistent with [privacy-policy.md](./privacy-policy.md) §2. Part of the [launch-compliance checklist](./launch-compliance-checklist.md) §E.

**Last updated: 2026-09-15 (Growth S3)** — the next build adds **Sign in with Apple** (iOS) and **Sign in with Google** (both platforms). That adds **Name** on both forms (Google passes the account name, which Supabase Auth stores with the account) and widens Email Address to provider emails, including Apple *Hide My Email* relay addresses. See the changelog. Earlier the same day: v2.4.0 adds **add-on channel selections** (`user_service_addons`: which Prime Video Channels, Apple TV Channels or NOW passes a user says they hold). They are more values of a row both forms already declare — service selections — so **neither form needs a new data type**; the wording below now names them. The search-history rows (2026-09-09) were filed on both forms for v2.3.1.

**Two facts that shape every answer:**
1. **No third-party sharing.** The external APIs (TMDb, OMDb, Streaming Availability API, OpenAI) receive **no user PII** — only catalogue identifiers. Supabase + Cloudflare are **service providers / processors** acting on Videx's behalf, which both stores exclude from "sharing". So: **data is collected, not shared/sold.**
2. **No tracking.** No ad networks, no cross-app/cross-site tracking, no data brokers. Apple "Tracking" = **None**.

Rows marked **(H0)** land during the current cycle — include them if the feature is live at submission, otherwise add them when it ships and re-submit:
- **Crash/diagnostics** — Stream A3 adds Sentry-style crash reporting (collects crash logs + basic device/diagnostic data).
- **Push token** — Stream B Phase 1 adds a device push token (a device identifier).

---

## Google Play — Data Safety form

**Overall:**
- Does your app collect or share user data? **Yes, collect. No sharing** (as defined by Play — processors excluded).
- Is all data encrypted in transit? **Yes** (HTTPS/TLS everywhere).
- Do you provide a way to request data deletion? **Yes** — in-app *Delete my account*, plus the privacy-policy contact.

**Data types collected** (all: collected = yes; shared = no; processed ephemerally = no; collection = required, except feedback/notifications = optional):

| Play data type | Videx data | Purpose(s) |
|---|---|---|
| Personal info → **Name** | the name on a Google account used to sign in (stored by Supabase Auth with the account). Apple's name is used once, on the device, to suggest a username, and not stored | Account management |
| Personal info → **Email address** | account email (Supabase Auth): typed at sign-up, or supplied by Apple or Google at sign-in (an Apple *Hide My Email* relay address if the user chose it) | Account management, app functionality |
| Personal info → **User IDs** | username, account id | Account management, app functionality |
| Personal info → **Other info** | UK region, viewing context, age range | App functionality, personalisation |
| App activity → **App interactions** | thumbs, watched, watchlist, dismiss, detail views, dwell time, **click-outs (service, link type, price shown)**, impressions | App functionality, personalisation, analytics |
| App activity → **In-app search history** | the words typed into Browse search; the preset card tapped; result count | Analytics, personalisation |
| App activity → **Other user-generated content** | watchlist, in-app feedback (`app_feedback`) | App functionality |
| App activity → **Other actions** | taste vector, interest centroids, genre picks, service and add-on channel selections, slider settings | Personalisation (recommendations) |
| App info & performance → **Crash logs** · **Diagnostics** **(H0)** | crash reports + device diagnostics (Sentry) | Crash prevention, diagnostics |
| Device or other IDs → **Device or other IDs** **(H0)** | push token | Delivering notifications the user opted into |

**Not collected** (leave unticked): Location, Financial info, Health & fitness, Messages, Photos/videos, Audio, Files/docs, Calendar, Contacts, Web browsing history, and any advertising/marketing use.

---

## Apple — App Privacy (App Store Connect)

**Tracking:** **Data Not Used to Track You** — Videx does not track. (No ad SDKs, no cross-app identifiers, no data-broker sharing.)

**Data collected — all "Linked to You", none used for Tracking, none for Third-Party Advertising:**

| Apple category | Data type | Videx data | Purpose |
|---|---|---|---|
| **Contact Info** | Name | the name on a Google account used to sign in (stored with the account). Sign in with Apple's name is used on the device to suggest a username and not stored | App Functionality |
| **Contact Info** | Email Address | account email: typed at sign-up, or supplied by Apple or Google at sign-in (may be a *Hide My Email* relay address) | App Functionality |
| **Identifiers** | User ID | username / account id | App Functionality |
| **Identifiers** | Device ID **(H0)** | push token | App Functionality (notifications) |
| **User Content** | Other User Content | watchlist, in-app feedback | App Functionality |
| **Search History** | Search History | words typed into Browse search; preset card tapped; result count | Analytics, Product Personalization |
| **Usage Data** | Product Interaction | thumbs, watched, watchlist, taps, **click-outs**, dwell, impressions, taste/centroid/slider/genre data, service and add-on channel selections | App Functionality, Analytics, Product Personalization |
| **Diagnostics** | Crash Data · Performance Data **(H0)** | crash reports (Sentry) | App Functionality (crash diagnostics) |

**For each of the above:** *Linked to the user = Yes* (tied to their account); *Used for tracking = No*.

**Explicitly NOT collected** (do not add): Location, Financial Info, Health & Fitness, Contacts, Photos or Videos, Audio Data, Browsing History *(Videx has no web browser and records no URLs; in-app search is a separate category and IS collected — see the row above)*, Sensitive Info, Purchases, Physical Address.

---

## Notes for whoever fills the forms

- **Age rating / target audience:** general audience, **not** directed at children (13+ floor, no under-18 targeting). Answer Play's "target audience and content" and Apple's age-rating questionnaire accordingly — do **not** opt into any "designed for families / children" programme.
- **Re-submit triggers:** turning on push notifications (adds the device-ID rows) or crash reporting (adds the diagnostics rows) changes these answers — update both forms when those ship. **Search-term logging was the third such trigger and it has fired** (2026-09-08); the rows are in the tables above and both forms are outstanding.
- **Consistency check:** every row here must have a matching disclosure in Privacy Policy §2. If you add a data type to one, add it to the other. *(Open: the policy does not yet name Apple and Google sign-in or the Name row — IN-GR-014.)*
- **Apple and Google sign-in are not "sharing".** The user authenticates with Apple or Google, who return an identity token to Videx; Videx sends them nothing about the user. Neither form counts an identity provider the user chose as a recipient. Apple's *Hide My Email* relay addresses are still the user's email for both forms (declare them under Email Address; they are linked to the account).

### What the search rows actually contain

Worth having to hand, because both forms ask follow-up questions and the honest answers are narrower than "we log searches".

| Question | Answer |
|---|---|
| What is stored | One `user_interactions` row per **settled** search — never per keystroke — plus one per discrete browse intent (a preset card tap, a filter apply, a refine-chip toggle). The full `metadata` vocabulary is listed below. |
| Is it linked to the user | **Yes.** The row carries `user_id` and `session_id`. Declare as Linked to You on Apple; do not claim anonymity. |
| Is the text kept indefinitely | **No.** A nightly job (migration 079) strips `metadata.query` from rows older than 30 days after folding the term into `search_terms_daily`, a per-day count with **no user column**. The rest of the row survives. |
| Can the user turn it off | **Not in the app.** It is gated on a per-user `search_logging` flag, default off, set by the operator — there is no in-app control, so Play's "users can choose" does **not** apply. Answer *collection is required*. |
| Is it deleted and exported | **Yes**, both. `user_interactions` is covered by *Delete my account* (migration 042) and by the data export (043 / 061). Verified against the test account on 2026-09-08. |
| Does it leave Videx | The typed text goes to **TMDb** as a search query (no PII attached) and, on the semantic path, to **OpenAI** for embedding. Both are disclosed in Privacy Policy §4. Neither receives a user identifier, so this stays *collected*, not *shared*, under both stores' definitions. |

**Every field a search row can carry.** Listed in full because both forms ask, and because "the query text and the result count" — what this sheet used to say — is narrower than the truth. None of it is free text apart from `query` itself.

| Key | On which rows | What it is |
|---|---|---|
| `query` | typed searches; a preset tap on the semantic path | The words typed, or the app-authored mood phrase behind a preset card. **The only free text**, and the only field the 30-day retention strips. Null on filter applies, refine toggles and quick-filter chips. |
| `result_count` | all | How many titles the surface showed. |
| `mode` | all | `lookup` (typed) / `semantic` (vector) / `filter` (a tap, not text). |
| `route` | typed searches | Which layout answered: `title` / `described` / `lookup`. Replaced `category` on 2026-09-09. |
| `mood_key`, `slot`, `selection_reason` | preset card taps | Which of the eight cards was tapped, which of the four slots it sat in, and why the app chose to offer it (time of day / taste affinity / weekly rotation / fixed). A card identifier, not its words. |
| `semantic` | preset card taps | Whether the tap ran vector search or the deterministic filter fallback. |
| `filters` | filter applies, refine toggles | The whole `BrowseFilters` object as applied — content type, genres, minimum rating, runtime band, release window, cost, watched-state, **and the streaming services selected**. Services are a user's own subscription list, which is already stored in the profile; this records which of them a given search was scoped to. |
| `refine`, `on` | refine-chip toggles | Which of the five one-tap axes was touched and in which direction. |
| `surface`, `category`, `rails_visible`, `items_visible` | quick-filter chips on New and For You | Which screen, which chip (All / Movies / TV / Documentaries), and how much of the page survived it. Counts and a category label, not content. |

**Impression rows** (`event_type = 'card_impression'`, a different row type, same table and the same deletion/export coverage) additionally carry `route` and `refine` for anything rendered on Browse, so a search can be joined to whether its results were actually looked at. No title-level personal data beyond the content id already recorded for every impression.

**Why the purpose is Analytics + Personalisation and not App Functionality.** Search works with logging off — the flag defaults to off and most accounts have never had it on. The rows exist to measure the funnel (§6 of the presets recommendation, particularly the zero-result rate) and to feed the search-attribution boost in the taste vector. Claiming App Functionality would overstate the need.

---

## Changelog

- **2026-09-15 (Growth S3)** — Added **Name** (Play *Personal info → Name*; Apple *Contact Info → Name*, App Functionality) and widened **Email Address** for Sign in with Apple (iOS) and Sign in with Google (both platforms). What is stored: Supabase Auth keeps the provider's identity claims with the account (`auth.users.raw_user_meta_data`: for Google the account name, email and avatar URL; for Apple the email only — Apple's given name arrives on the device once and is used in memory to suggest a username). The username is still the user's own choice ("Choose your name"). Covered by *Delete my account* (the `auth.users` row cascades). **Both forms need updating with the build that ships sign-in** (Joe files them).

- **2026-09-15** — Named **add-on channel selections** alongside service selections (Play *Other actions*, Apple *Product Interaction*). Shipped in migration 086 and the v2.4.0 binary; stored in `user_service_addons`, covered by *Delete my account* and the data export (export v1.2), disclosed in Privacy Policy §2. Same category, same purposes, collection required — **no form change needed**; the sheet wording now matches the data.
- **2026-09-09 (second pass)** — Widened *What the search rows actually contain* into a full per-key table. The sheet had listed four fields where the rows carry a dozen, and omitted two that a reviewer would reasonably ask about: the `filters` blob includes the user's selected **streaming services**, and refine-chip and quick-filter rows carry their own axes and visibility counts. Nothing new is collected and nothing changes on either form — every key still falls under "in-app search history" — but the sheet now matches the rows.
- **2026-09-09** — Added **Play: App activity → In-app search history** and **Apple: Search History**. Removed Search History from Apple's "explicitly NOT collected" list, where it had sat with the justification *"app-internal genre/taste selection is Product Interaction, not web/app search history"*. That was true when written and became false on 2026-09-08, when search-term logging shipped and began storing the text users type. Caught on 2026-09-09 while reviewing v2.3.0, the first native binary carrying the feature. Neither form has been re-submitted; both are due with v2.3.1.
