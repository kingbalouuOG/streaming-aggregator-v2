# Videx — store data-safety disclosure answers

**For:** Google Play Data Safety form + Apple App Privacy labels. Copy from here; keep consistent with [privacy-policy.md](./privacy-policy.md) §2. Part of the [launch-compliance checklist](./launch-compliance-checklist.md) §E.

**Last updated: 2026-09-09** — search-term logging shipped on 2026-09-08 and reached a native binary in v2.3.0. Both forms now need a search-history row, and this sheet used to assert the opposite (see the changelog at the foot). **Neither form has been re-submitted yet**; the answers below are ready to copy when v2.3.1 goes out.

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
| Personal info → **Email address** | account email (Supabase Auth) | Account management, app functionality |
| Personal info → **User IDs** | username, account id | Account management, app functionality |
| Personal info → **Other info** | UK region, viewing context, age range | App functionality, personalisation |
| App activity → **App interactions** | thumbs, watched, watchlist, dismiss, detail views, dwell time, **click-outs (service, link type, price shown)**, impressions | App functionality, personalisation, analytics |
| App activity → **In-app search history** | the words typed into Browse search; the preset card tapped; result count | Analytics, personalisation |
| App activity → **Other user-generated content** | watchlist, in-app feedback (`app_feedback`) | App functionality |
| App activity → **Other actions** | taste vector, interest centroids, genre picks, service selections, slider settings | Personalisation (recommendations) |
| App info & performance → **Crash logs** · **Diagnostics** **(H0)** | crash reports + device diagnostics (Sentry) | Crash prevention, diagnostics |
| Device or other IDs → **Device or other IDs** **(H0)** | push token | Delivering notifications the user opted into |

**Not collected** (leave unticked): Location, Financial info, Health & fitness, Messages, Photos/videos, Audio, Files/docs, Calendar, Contacts, Web browsing history, and any advertising/marketing use.

---

## Apple — App Privacy (App Store Connect)

**Tracking:** **Data Not Used to Track You** — Videx does not track. (No ad SDKs, no cross-app identifiers, no data-broker sharing.)

**Data collected — all "Linked to You", none used for Tracking, none for Third-Party Advertising:**

| Apple category | Data type | Videx data | Purpose |
|---|---|---|---|
| **Contact Info** | Email Address | account email | App Functionality |
| **Identifiers** | User ID | username / account id | App Functionality |
| **Identifiers** | Device ID **(H0)** | push token | App Functionality (notifications) |
| **User Content** | Other User Content | watchlist, in-app feedback | App Functionality |
| **Search History** | Search History | words typed into Browse search; preset card tapped; result count | Analytics, Product Personalization |
| **Usage Data** | Product Interaction | thumbs, watched, watchlist, taps, **click-outs**, dwell, impressions, taste/centroid/slider/genre/service data | App Functionality, Analytics, Product Personalization |
| **Diagnostics** | Crash Data · Performance Data **(H0)** | crash reports (Sentry) | App Functionality (crash diagnostics) |

**For each of the above:** *Linked to the user = Yes* (tied to their account); *Used for tracking = No*.

**Explicitly NOT collected** (do not add): Location, Financial Info, Health & Fitness, Contacts, Photos or Videos, Audio Data, Browsing History *(Videx has no web browser and records no URLs; in-app search is a separate category and IS collected — see the row above)*, Sensitive Info, Purchases, Physical Address.

---

## Notes for whoever fills the forms

- **Age rating / target audience:** general audience, **not** directed at children (13+ floor, no under-18 targeting). Answer Play's "target audience and content" and Apple's age-rating questionnaire accordingly — do **not** opt into any "designed for families / children" programme.
- **Re-submit triggers:** turning on push notifications (adds the device-ID rows) or crash reporting (adds the diagnostics rows) changes these answers — update both forms when those ship. **Search-term logging was the third such trigger and it has fired** (2026-09-08); the rows are in the tables above and both forms are outstanding.
- **Consistency check:** every row here must have a matching disclosure in Privacy Policy §2. If you add a data type to one, add it to the other.

### What the search rows actually contain

Worth having to hand, because both forms ask follow-up questions and the honest answers are narrower than "we log searches".

| Question | Answer |
|---|---|
| What is stored | One `user_interactions` row per **settled** search — never per keystroke. `metadata` holds the query text, the result count, the mode (`lookup` / `semantic` / `filter`) and, since 2026-09-09, which layout it resolved to and which preset slot was tapped. |
| Is it linked to the user | **Yes.** The row carries `user_id` and `session_id`. Declare as Linked to You on Apple; do not claim anonymity. |
| Is the text kept indefinitely | **No.** A nightly job (migration 079) strips `metadata.query` from rows older than 30 days after folding the term into `search_terms_daily`, a per-day count with **no user column**. The rest of the row survives. |
| Can the user turn it off | **Not in the app.** It is gated on a per-user `search_logging` flag, default off, set by the operator — there is no in-app control, so Play's "users can choose" does **not** apply. Answer *collection is required*. |
| Is it deleted and exported | **Yes**, both. `user_interactions` is covered by *Delete my account* (migration 042) and by the data export (043 / 061). Verified against the test account on 2026-09-08. |
| Does it leave Videx | The typed text goes to **TMDb** as a search query (no PII attached) and, on the semantic path, to **OpenAI** for embedding. Both are disclosed in Privacy Policy §4. Neither receives a user identifier, so this stays *collected*, not *shared*, under both stores' definitions. |

**Why the purpose is Analytics + Personalisation and not App Functionality.** Search works with logging off — the flag defaults to off and most accounts have never had it on. The rows exist to measure the funnel (§6 of the presets recommendation, particularly the zero-result rate) and to feed the search-attribution boost in the taste vector. Claiming App Functionality would overstate the need.

---

## Changelog

- **2026-09-09** — Added **Play: App activity → In-app search history** and **Apple: Search History**. Removed Search History from Apple's "explicitly NOT collected" list, where it had sat with the justification *"app-internal genre/taste selection is Product Interaction, not web/app search history"*. That was true when written and became false on 2026-09-08, when search-term logging shipped and began storing the text users type. Caught on 2026-09-09 while reviewing v2.3.0, the first native binary carrying the feature. Neither form has been re-submitted; both are due with v2.3.1.
