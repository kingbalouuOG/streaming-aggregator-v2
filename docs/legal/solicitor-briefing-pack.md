# Videx — Solicitor Briefing Pack (IN-XPS-014)

**Prepared:** 2026-07-06 · **For:** a UK tech / commercial solicitor, for a fixed-fee review of two documents.
**Blocker reference:** IN-XPS-014 — the hard public-launch blocker. Videx cannot be published to the App Store or Google Play for a non-prototype user base until these documents are lawyer-vetted.

**Documents under review (attached, in this folder):**
- [Privacy Policy](./privacy-policy.md) — 11 sections, ~1,500 words
- [Terms of Service](./terms-of-service.md) — 12 sections, ~1,100 words

Both are **descriptive drafts** written by the developer against the real technical implementation. They carry a lawyer-vetting caveat footer and intentionally leave `[TBC]` placeholders (contact details, effective date). They have **not** been legally reviewed.

**How to use this pack:** §1 says what the product is; §2 is a one-page data-flow inventory (what's collected, where it lives, retention); §3 lists the user-rights mechanisms already built, so you can check the docs match reality; §4 is the specific questions we need answered; §5 lists gaps we've already spotted; §6 covers engagement logistics and turnaround.

**One review, one pass.** This pack deliberately describes the app **as it will be at public release**, not only as it is today. That includes two features landing during the current work cycle (H0): completed **click-out logging** (§2.4) and **push notifications + consent** (§2.5). Please review against the full picture so we pay for legal review **once**.

---

## 1. What the product is

Videx is a personal viewing-recommendation app for UK streaming services, currently shipping as a React Native / Expo Android app (an iOS build follows). It recommends films and TV from the services the user already subscribes to, based on in-app taste signals, and **deep-links out** to those services to watch. **It streams no content itself**, hosts no media, and is not affiliated with any streaming service. It is **free** — no payments, no ads, no third-party ad networks.

**Data controller:** Joe Green, sole developer, operating as an individual (**not incorporated**). *Please flag if the controller wording needs anything more given there is no company (e.g. a trading name, ICO registration reference).*

**Current scale:** friends-and-family / pre-launch. 5 registered users, a few dozen interaction events. The review is needed before recruiting beyond this circle and before either public store listing goes live.

**Distribution:** direct Android build and internal store tracks today; a **quiet public release on Google Play and (later) the App Store** is the immediate next milestone this review unblocks.

---

## 2. Data-flow inventory (one page)

All user data lives in a single **Supabase** Postgres project. *(Region: the Privacy Policy §3 states **London, UK / eu-west-2** — **Joe to confirm the actual project region before this is relied on**; if it is a US region the international-transfer wording in §3/§4 must change.)*

### 2.1 Collected and stored

| Category | Examples | Table | Retention |
|---|---|---|---|
| Account | username, UK region, theme, viewing context, age range, onboarding-complete flag | `profiles` | Until account deletion |
| Interactions | thumbs up/down, watched, watchlist add, dismiss, service tap, detail view, time-on-page, **deep-link click-out (§2.4)** — each with TMDb id + timestamp | `user_interactions` | Until account deletion |
| Impressions | which titles shown, row, position, time, context | `card_impressions` | **Raw rows deleted after 90 days**, rolled up to daily aggregates |
| Taste profile | 1,536-dim taste vector (computed locally, deterministic), 4 slider positions | `taste_profiles` | Until account deletion |
| Interest centroids | up to 3 derived sub-taste vectors (computed, deterministic) | `user_interest_centroids` | Until account deletion (via cascade) |
| Service selections | which UK services the user subscribes to | `user_services` | Until account deletion |
| Genre picks | onboarding taste-cluster selections | `user_genres` | Until account deletion |
| Watchlist | saved titles | `watchlist` | Until account deletion |
| Onboarding analytics | which onboarding steps reached | `onboarding_events` | Until account deletion |
| App feedback | in-app feedback submissions | `app_feedback` | Until account deletion |
| Feature flags | per-user experiment flags | `user_feature_flags` | Until account deletion |

**Authentication:** email + password via **Supabase Auth** (the email address is held by Supabase Auth acting as processor).

**Explicitly NOT collected:** location, cross-app activity, what is actually watched on the streaming services, photos, contacts, biometrics, payment information.

### 2.2 Hosting & sub-processors

- **Supabase** — primary processor (database + auth). Supabase Pro tier: point-in-time recovery, 7-day backups. Joe is the only admin.
- **Third parties for catalogue enrichment only — no user PII is sent to any of them:** TMDb, OMDb, the Streaming Availability API (via RapidAPI), **Cloudflare** (the edge/API-proxy layer the app's requests pass through), and **OpenAI** (server-side catalogue jobs only: title text → embeddings + room labels; never user data). Each is contracted under its own public terms; none acts as a joint controller for the §2.1 data.

### 2.3 New for release — additions since the drafts were written

The two draft documents were authored 2026-05-14. Two data flows are being **added during the current H0 cycle** and must be covered by this review even though they may not yet be visible in the drafts:

### 2.4 Click-out logging (landing in H0 — Stream A2)

When a user taps through to a streaming service, Videx logs a `deep_link_click` event into `user_interactions`. This **already** records: the service, the destination URL, dwell time before the click, a confidence flag, on-screen position, and the origin surface. **Being completed in this cycle**, two fields are added to that event's metadata:

- **`link_type`** — whether the outbound link was an **exact** title deep-link or a **search** fallback.
- **`price_shown`** — the rent/buy price (if any) displayed to the user at the moment of the click.

This is **behavioural / catalogue metadata tied to the user's account**, not a new category of sensitive personal data. It introduces no new third party. It follows the same retention and rights path as all other `user_interactions` rows (deleted and exported by the mechanisms in §3). Its purpose: it completes the product's core engagement metric (a user deciding what to watch) and is **seed data for possible future affiliate / commercial features** — see the forward-looking heads-up in §4, Q9.

### 2.5 Push notifications & notification consent (landing in H0 — Stream B Phase 1)

> ⚠️ **PLACEHOLDER — to be confirmed.** The notifications data model is being specified in the current cycle (roadmap item 0.9, Stream B Phase 1) and its half-page data-model note has **not yet landed** at time of writing. The description below is the **provisional expected shape** from the approved brief; the finalised note will be dropped in here verbatim before the pack is sent to the solicitor. **Do not treat 2.5 as final until this banner is removed.**

Provisional shape:

- **Push tokens** — a new `user_push_tokens` table storing, per user: the Expo push token, the platform (Android/iOS), minimal device metadata, and created/updated timestamps. RLS owner-only. The push token is an **online identifier** and should be treated as personal data. Tokens are **cleared on sign-out** and **dead tokens are pruned** by the delivery pipeline.
- **Notification consent / preferences** — per-type opt-in (e.g. *arrival alerts*, *leaving-soon alerts*). Consent is **requested after the first value moment** (not at first launch), is **withdrawable** via Profile toggles, and is **enforced server-side** (the alert cron filters on consent state, not just the client).
- **Purpose:** a retention loop — telling a user when a title on their watchlist arrives on, or is leaving, a service they subscribe to. No notification content leaves the user's own data set.

**Questions this raises for the solicitor are folded into §4** (consent capture/withdrawal wording; whether push tokens need explicit disclosure; PECR relevance).

---

## 3. Implemented user-rights mechanisms (built and working, not aspirational)

- **Deletion (Art. 17).** In-app *Delete my account* → the `delete_own_account` DB function (migration 042). It runs explicit `DELETE`s across every user-owned table, then `DELETE FROM auth.users`; `user_interest_centroids` is removed by `ON DELETE CASCADE`. Net effect: **all user-owned rows gone, irreversibly, within seconds.**
- **Access / portability (Art. 15/20).** In-app *Download my data* → the `export_user_data` function (migration 043) returning a single machine-readable JSON file of the user's rows (impressions capped to the last 90 days). **Known gap: the export does not currently include `user_interest_centroids`** (the derived sub-taste vectors). Deletion covers them; export does not — see §4 Q10 for the question this raises.
- **Rectification.** Profile fields (region, viewing context, age range) are editable in-app; username/email changes route to the developer.
- **Complaint to the ICO.** Signposted in Privacy Policy §6 and §11.

> **Two new tables to fold into the same mechanisms before release:** `app_feedback` and any `user_push_tokens` table (§2.5) must be added to both the delete and export functions. This is tracked internally; noting it here so the review can assume the rights mechanisms cover the full §2 inventory.

---

## 4. Questions for the solicitor

**Store-readiness & controller identity**

1. **Are the two drafts fit for App Store / Google Play public release** for a UK-based sole operator at this scale, subject to your redlines? Is anything in either document likely to be **rejected by Play's Data Safety / policy requirements** or by App Store review, or to require additional disclosure?
2. **Controller contact details — is email-only sufficient** under UK GDPR Art. 13(1)(a)? Our reading is that it is legally adequate. Joe is choosing between three ways to publish a contact route (he decides before the pack is sent — see §6): **email-only** · a **registered-office / director's-service address** (~£30–50/yr, preferred over publishing a home address) · a **PO box**. Please confirm email-only meets the transparency obligation, and flag any consumer-facing reason (store policy, trust) to publish a postal address anyway.
3. **ICO registration.** Does Joe need to register with the ICO and pay the data-protection fee before onboarding non-prototype users, and **which tier applies**? (Our expectation: **Tier 1 micro, £52/yr**, given a sole operator well under the turnover/headcount thresholds — please confirm the tier and that nothing about the processing profile pushes it higher.)
4. **Controller wording.** Joe operates as a **named individual, not a company**. Does the controller wording (Privacy Policy §1) need anything more — a trading name, the ICO registration number once obtained, or other identifiers?

**Children & age-gating**

5. **Age-gating posture.** Both docs set a **13+** floor (ToS §3, Privacy Policy §9) with no verification beyond a self-selected age range. Videx **does not target children** and there is no kids product on the roadmap, but streaming catalogues include adult-rated titles. Given the **ICO Children's Code**, is a self-declared 13+ floor defensible, or is a higher floor / some age-assurance step needed for a general-audience UK app that surfaces (but does not itself play) age-rated content?

**Lawful basis, consent & consumer terms**

6. **Lawful basis.** The Privacy Policy does not explicitly name a UK GDPR Art. 6 basis. For an account-based personalised-recommendation app, is **consent at signup** sufficient, or should we rely on **contract necessity** for the core service plus **consent** for analytics? How should the chosen basis be surfaced at signup?
7. **Consent surface.** Signup currently shows links to both documents and account creation implies acceptance (ToS §1). Is **implied acceptance via a visible link** adequate under UK GDPR / PECR, or do we need an **explicit unticked checkbox** — and does the push-notification consent (§2.5) need its own separate opt-in step?
8. **Liability & disclaimers under UK consumer law.** Are the limitation-of-liability (ToS §8) and the "as-is" availability disclaimer (ToS §7) enforceable as drafted under the **Consumer Rights Act 2015**, given the app is free? Is the **availability-accuracy clause** (ToS §7) sufficient to cover a user who taps through to a service that turns out not to carry the title? Anything that would be struck out as an unfair term?

**Third-party brands**

9. **Trademark use.** ToS §2 / §6 and the app UI use streaming-service **names and logos** to indicate availability. Is the **nominative-use** framing adequate, or is there brand-usage risk to address before a public listing?

**Forward-looking heads-up (flag only — not for detailed drafting yet)**

These are **not in scope for line-by-line review now**; we raise them so the current drafting **anticipates rather than blocks** them later:

10. **Derived-profile vectors in an access request.** Should the derived sub-taste vectors (`user_interest_centroids`) be **included in an Art. 15/20 export**? (They are deleted on erasure but not currently exported — §3.)
11. **Future affiliate links.** Videx may later add **affiliate / commercial outbound links** (the click-out data in §2.4 is partly seed data for this). This will need **ASA / CMA disclosure** copy. Please flag anything the current documents should say now so an affiliate disclosure slots in cleanly later.
12. **Future Premium tier.** A paid **Premium** subscription is planned post-scale. It will introduce **consumer-contract terms** (subscriptions, free-trial reminders, cancellation and cooling-off rights — including the 2026 rule changes in this area). Please flag, so today's ToS is structured to extend rather than be rewritten.

---

## 5. Gaps we've already flagged (please confirm / correct)

- **`[TBC]` placeholders** throughout both docs: contact email, postal address, effective date. Joe fills these before publish once the contact-address option (§4 Q2) is chosen.
- **No explicit Art. 6 lawful basis** stated (Q6).
- **No ICO registration** referenced yet (Q3).
- **Region claim unverified** — Privacy Policy §3 says eu-west-2 / London; to be confirmed before relied upon (§2).
- **Privacy Policy §2 inventory is stale** — it predates `user_interest_centroids`, `user_feature_flags`, and `app_feedback`, and does not yet describe the §2.4 click-out fields or §2.5 push data. The §2 table above is the current source of truth; the policy text will be brought in line before publish.
- **Retention is "indefinite until deletion"** for most tables (Privacy Policy §7). Please confirm that is acceptable for a free personalised app, or advise whether an inactivity prune is expected.
- **Export omits `user_interest_centroids`** (§3, Q10).

---

## 6. Engagement logistics

**What we're asking for:** a **fixed-fee** review of the two attached documents — a redline / comments pass plus answers to the §4 questions. Joe applies the redlines himself (the docs render in-app from these markdown files, so edits flow straight through to the app). A **turnaround estimate and fixed quote up front** would be appreciated.

**Why the pack looks the way it does:** we have front-loaded the technical reality (§2–§3) precisely so the review can be **scoped and fixed-fee** rather than open-ended, and so it happens **once** — covering the current app **plus** click-out logging and push consent (§2.4–§2.5).

**Joe's pre-send decision (owner: Joe, not the solicitor):** pick the **contact-address option** — email-only vs a registered-office / service address (~£30–50/yr) vs a PO box — and fill the `[TBC]` placeholders accordingly. Q2 asks the solicitor only to confirm the legal sufficiency of the chosen route.

**Sequencing note:** §2.5 (push data-model note) is finalised as Stream B Phase 1 lands; the pack is sent to the solicitor once that banner is cleared. Everything else here is final.

### Optional — fixed-fee UK solicitor shortlist (rough pricing)

For comparison only; Joe books the engagement and should confirm current fees directly. UK fixed-fee providers that handle **app / SaaS privacy policy + T&Cs** review for small operators typically land in the **~£500–£1,500** range for a two-document review, depending on depth:

| Provider | Fit | Rough fixed fee (verify) |
|---|---|---|
| **Sprintlaw UK** | Fixed-fee, startup/app-focused, packaged app T&Cs + privacy work | App T&Cs packages from **~£1,100**; bundles available |
| **PAIL Solicitors** | Mobile-app T&Cs / privacy specialists | Fixed-fee on enquiry |
| **JPP Law** | Fixed-fee startup legal packages | Package pricing on enquiry |
| **Adlex Solicitors** | Website & app T&Cs / IP specialists | Fixed-fee on enquiry |
| **A local commercial solicitor** | Often cheapest for a straight review of existing drafts | ~£500–£900 typical for a two-doc review |

**Separate statutory cost (not legal fees):** the **ICO data-protection fee** is expected to be **Tier 1 — £52/yr** for a sole operator (£47 by direct debit). Confirm via the ICO self-assessment tool. This is a registration Joe does himself; it is not part of the solicitor engagement.

---

*Assembled 2026-07-06 for IN-XPS-014. Companion to the earlier internal [solicitor-review-pack.md](./solicitor-review-pack.md) (2026-06-12), which this supersedes for the H0 release scope by adding the two H0 data flows (§2.4–§2.5) and the store-readiness / ICO / age-gating / forward-looking questions. Once the solicitor's feedback is applied to `privacy-policy.md` and `terms-of-service.md` (placeholders replaced with the chosen contact route), IN-XPS-014 closes in the pre-launch-blockers register and the parking lot, with a wiki log entry.*
