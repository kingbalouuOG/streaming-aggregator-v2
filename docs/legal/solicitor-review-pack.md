# Videx — Solicitor Review Pack (IN-XPS-014)

**Prepared:** 2026-06-12 · **For:** UK tech/startup solicitor, fixed-fee review of two documents.
**Documents under review:**
- [Privacy Policy](./privacy-policy.md) (195 lines / ~1,500 words, 11 sections)
- [Terms of Service](./terms-of-service.md) (138 lines / ~1,100 words, 12 sections)

**Supplementary data-model note (added 2026-07-06):**
- [Push Notifications — Data-Model Note](./notifications-data-model.md) — Notifications v1 (H0 Stream B) adds push tokens, per-type opt-in prefs, and a delivery log, plus the Expo/APNs/FCM processor chain. Please fold this surface into the same pass; it lists four extra questions (push lawful basis, processor disclosure, Play Data Safety, delivery-log retention) as additions to §4 below.

This pack gives you (1) what the app actually does with data, (2) the specific questions we need answered, and (3) the known gaps we've already spotted. The two documents are descriptive drafts written by the developer against the real technical implementation; they have **not** been legally reviewed. We want them launch-ready for a small UK user base (initially two testers, then a limited prototype), distributed as a direct Android APK now and likely Google Play later.

---

## 1. What the product is

Videx is a personal viewing-recommendation Android app (Capacitor/WebView) for UK streaming services. It recommends films/TV from the user's existing subscriptions based on their in-app taste signals, and deep-links out to the streaming services to watch. **It streams no content itself** and is not affiliated with any streaming service. Free during the prototype phase (no payments, no ads).

**Data controller:** Joe Green, sole developer, as an individual (not yet incorporated — *flag if this matters for the controller wording*).

## 2. Plain-English data inventory

**Collected and stored (all in a Supabase Postgres project):**

| Category | Examples | Table |
|---|---|---|
| Account | username, UK region, theme, viewing context, age range, onboarding-complete flag | `profiles` |
| Interactions | thumbs up/down, watched, watchlist add, dismiss, service tap, detail view, time-on-page — each with TMDb id + timestamp | `user_interactions` |
| Impressions | which titles shown, row, position, time, context | `card_impressions` (rolled to daily aggregates after 90d) |
| Taste profile | 1,536-dim taste vector (computed locally, deterministic), 4 slider positions | `taste_profiles` |
| Service selections | which UK services the user subscribes to | `user_services` |
| Genre picks | onboarding taste-cluster selections | `user_genres` |
| Watchlist | saved titles | `watchlist` |
| Onboarding analytics | which onboarding steps reached | `onboarding_events` |
| Interest centroids | up to 3 derived sub-taste vectors (like the taste vector — computed, deterministic) | `user_interest_centroids` |
| Feature flags | per-user experiment flags | `user_feature_flags` |

> **Note for Joe (doc-accuracy gap):** the last two tables were added *after* the Privacy Policy was written (ENG-1 / Search V2), so **Privacy Policy §2 does not list them** — the inventory there is stale and should be updated to match this table before publish.

**Authentication:** email + password via Supabase Auth (email address is held by Supabase Auth as processor).

**Explicitly NOT collected:** location, cross-app activity, what's actually watched on the streaming services, photos, contacts, biometrics, payment info.

**Hosting / region:** Supabase Pro. The Privacy Policy §3 states **London, UK (eu-west-2)** — *Joe to CONFIRM the actual project region before this is relied upon; if the project is in a US region the international-transfer wording in §3/§4 needs to change.*

**Third parties (catalogue enrichment only — no user PII sent to any of them):** TMDb, OMDb, Streaming Availability API (via RapidAPI), Cloudflare (the API-proxy/edge layer the app's requests pass through), OpenAI (server-side catalogue jobs only: title text → embeddings + room labels; never user data). Supabase is the primary processor.

## 3. Implemented user-rights mechanisms (so you can check the docs match reality)

These are **built and working**, not aspirational:
- **Deletion (Art. 17):** in-app "Delete my account" → a `delete_own_account` database function. It runs explicit DELETEs across `card_impressions, user_interactions, taste_profiles, user_services, user_genres, watchlist, onboarding_events, user_feature_flags, profiles` then `DELETE FROM auth.users`; `user_interest_centroids` is removed by an `ON DELETE CASCADE` on that final delete. Net effect: **all user-owned rows gone, irreversibly, within seconds.** *(Internal task IN-PX-54 tracks a CI check that this table list can't drift from the schema — currently hand-maintained.)*
- **Portability/access (Art. 15/20):** in-app "Download my data" → an `export_user_data` function returning a single JSON file of the user's rows. **Known gap: the export does NOT currently include `user_interest_centroids`** (the derived sub-taste vectors). Deletion covers it; export doesn't. Flagging so you can advise whether derived-profile vectors must be included in an Art. 15/20 response.
- **Rectification:** profile fields editable in-app; username change is email-to-developer.

## 4. Questions we need answered

1. **Lawful basis.** The Privacy Policy doesn't explicitly name a UK GDPR Art. 6 lawful basis. For an account-based personalised-recommendation app, is consent-at-signup sufficient, or should we rely on contract necessity for the core service + consent for analytics? How should the chosen basis be surfaced at signup?
2. **Consent surface.** Currently signup shows links to both documents and account creation implies acceptance (ToS §1). Is implied acceptance via a visible link adequate under UK GDPR/PECR, or do we need an explicit unticked checkbox?
3. **Controller identity.** Joe operates as a named individual, not a company. Does the controller wording (Privacy Policy §1) need anything more (e.g. a trading name, ICO registration)? **Does Joe need to register with the ICO as a data controller, and pay the data-protection fee, before onboarding non-prototype users?**
4. **Children.** Both docs set a 13+ floor (ToS §3, Privacy Policy §9). Streaming content can be adult-rated. Is 13+ defensible with no age-verification beyond a self-selected age range, or is a higher floor / verification needed?
5. **Liability & disclaimer.** Are the limitation-of-liability (ToS §8) and "as-is" availability disclaimer (ToS §7) enforceable as drafted under UK consumer law (CRA 2015), given Videx is free? Anything that would be struck out as an unfair term?
6. **Availability-accuracy clause.** ToS §7 disclaims real-time accuracy of availability/deep-link data. Sufficient to cover a user who taps through to a service that doesn't actually have a title?
7. **Third-party trademark use.** ToS §2/§6 use streaming-service names and (in the app) logos to indicate availability. Is the nominative-use framing adequate, or is there brand-usage risk to address before a public listing?
8. **Google Play specifics.** Anything in either document that Play's Data Safety / policy requirements would reject or require additional disclosure for?

## 5. Known gaps we've already flagged (please confirm / correct)

- `[TBC]` placeholders throughout: contact email, UK postal address, effective date. (Joe will fill before publish.)
- No explicit Art. 6 lawful basis stated (Q1).
- No ICO registration referenced (Q3).
- Region claim unverified (§2 above).
- Data-retention policy is "indefinite until deletion" for most tables (Privacy Policy §7) — confirm that's acceptable or whether an inactivity-prune is advisable.

## 6. What we need back

Redline / comments on the two markdown documents, plus answers to §4. Joe will apply the redlines (the docs render in-app from these markdown files via `react-markdown`, so edits flow straight through). Turnaround estimate and fixed fee appreciated up front.
