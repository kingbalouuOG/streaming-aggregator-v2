# Videx — DIY launch-compliance checklist (roadmap item 0.1)

**Owner:** Joe · **Created:** 6 July 2026 · **Status:** in progress
**Scope:** everything Videx needs to launch legally on Google Play + the App Store **without** a paid solicitor. Paid legal review is deferred to the H2 monetisation gate (Decision 6) — see [solicitor-briefing-pack.md](./solicitor-briefing-pack.md).

## Why no solicitor is needed to launch

Neither the app stores nor UK GDPR require *lawyer-vetted* policies. They require four concrete things, all of which are DIY:

1. **A public privacy-policy URL** — §D below.
2. **Accurate disclosures** — the policy must truthfully describe what the app does with data — §B below.
3. **Working data-subject rights** — delete + export — **already shipped** (`delete_own_account` migration 042, `export_user_data` migration 043).
4. **ICO data-protection fee** paid — §A below.

A solicitor becomes non-optional at H2, when Premium introduces consumer-contract terms (DMCCA) and affiliate links need ASA/CMA disclosures. That is the parked engagement, not this checklist.

---

## A. ICO registration (Joe registers himself)

**Do you need to pay?** Yes. Videx processes personal data (accounts, taste/interaction data) electronically for a commercial purpose. None of the exemptions (not-for-profit, staff-admin-only, personal/household use) apply. Confirm with the ICO's self-assessment tool: <https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee-self-assessment/>

**Which tier?** **Tier 1 (micro).** Tier 1 covers any organisation with **max turnover £632,000/yr OR ≤ 10 staff** — a sole operator is comfortably inside it. Nothing in Videx's processing profile pushes it higher (Tier 3's £3,763 is for large organisations only).

**Cost:** **£52/year**, reduced to **£47** if you pay by direct debit. Renews annually.

**What you enter on the registration form** (<https://ico.org.uk/registration/new/>):

| Field | Value |
|---|---|
| Type of organisation | Sole trader / individual |
| Name | Joe Green |
| Trading name (optional) | Videx |
| Turnover | Under £632,000 → **Tier 1** |
| Number of staff | 1 (≤10) → **Tier 1** |
| Payment | £52 (or £47 by direct debit) |

**⚠️ Address caveat — read before registering.** ICO registration requires a contact **address**, and **the ICO register is publicly searchable**. This is separate from the privacy-policy contact (which you've chosen to keep email-only). If you do **not** want your **home address** on the public ICO register, register with a **service / registered-office address** (~£30–50/yr) instead. This is the one place the "email-only" choice doesn't fully avoid a public address — decide before you submit.

**Outcome to record:** ICO registration reference number + renewal date. Once you have the reference, it can optionally be added to Privacy Policy §1 (many UK controllers cite it, but it is not mandatory to publish).

---

## B. Policy text — accuracy pass ✅ done in this PR

The policy must describe what the app **actually** does. Two H0 features change the data picture; the policy has been updated to match, mirroring the plain-English "What Videx learns" convention from the in-app Privacy & Data screen.

- **Click-out logging (Stream A2) — added.** Privacy Policy §2 now discloses that a click-out records the service tapped, whether the link was an **exact** title link or a **search** fallback (`link_type`), and the **rent/buy price shown** at click time (`price_shown`). *(Note: at the time of writing, `emitDeepLinkClick` in `src/lib/storage/interactions.ts` still needs to persist `link_type` + `price_shown` — Stream A owns that code change. The policy describes the intended, disclosed behaviour; confirm the code matches before relying on the disclosure.)*
- **Inventory corrected.** §2 now also lists `user_interest_centroids`, `user_feature_flags`, and `app_feedback`, which the original draft predated.
- **Push notifications (Stream B Phase 1) — published.** The former `<!-- PENDING SLOT -->` block at the end of Privacy Policy §2 is now a live "Push notifications" subsection (push token, platform, per-type consent, Expo/APNs/FCM processors), filled from [notifications-data-model.md](./notifications-data-model.md) after Stream B Phase 1 shipped.
  - [x] **Push-notifications policy copy finalised** (Stream B Phase 1 shipped; slot filled 7 July 2026).

---

## C. Contact details + caveat footer ✅ done in this PR

- **Contact route:** **email-only** (Joe's choice, 6 July 2026 — legally sufficient under UK GDPR Art. 13(1)(a); no postal address required or published).
- **Published address:** `privacy@videx.app` (dedicated address, Joe's choice). Placeholders replaced in both `privacy-policy.md` and `terms-of-service.md`; the "not lawyer-vetted" caveat footers removed.
- **⚠️ One open dependency — the mailbox must actually work.** `privacy@videx.app` is a *dedicated* address on a domain that **does not exist yet** (there is no Videx custom domain — the Worker is on `workers.dev`). Before the policy pages go public:
  - [ ] **Register the `videx.app` domain** (or confirm the domain you'll actually use — if it differs, change the address in both markdown files and the Worker routes).
  - [ ] **Stand up the mailbox or a forwarder** to a monitored inbox, so a data-subject email actually reaches you. A dead contact address on a published policy is itself a compliance failure.

---

## D. Hosted policy URLs ✅ routes added in this PR

The stores require a **publicly reachable** privacy-policy URL; today the policies only render in-app. Stream B's Worker title-page route hasn't landed, so this PR adds the two routes to `workers/api` directly (they serve the same `docs/legal/*.md` source, rendered to simple HTML — single source of truth, no drift):

- `GET /privacy` → the Privacy Policy
- `GET /terms` → the Terms of Service

**Store-listing URLs** (once the Worker is deployed — get the real subdomain from the deploy):

- `https://videx-api.<your-workers-subdomain>.workers.dev/privacy`
- `https://videx-api.<your-workers-subdomain>.workers.dev/terms`

Checklist:
- [ ] **Deploy the Worker** (`cd workers/api && npm run deploy`) and record the actual `workers.dev` URL.
- [ ] **Smoke-test** both URLs return HTML in a browser.
- [ ] **Paste the `/privacy` URL** into the Play Console listing and App Store Connect app-privacy fields.
- [ ] *(Nice-to-have)* if `videx.app` is registered for the email, point the policy pages at a custom domain (`videx.app/privacy`) for a cleaner store listing — a wrangler custom-domain route, still served by the same Worker.

---

## E. Store data-safety disclosures

Both stores make you self-declare what data the app collects. Answers must be **consistent with the privacy policy** (§B). A ready-to-copy answer sheet for both forms is at [store-privacy-disclosures.md](./store-privacy-disclosures.md).

- [ ] **Google Play Data Safety form** — fill from the Play section of the answer sheet.
- [ ] **Apple App Privacy labels** — fill from the Apple section of the answer sheet.
- [ ] Re-check both when push notifications ship (adds a "device/other identifiers" data type).

---

## Launch gate — tick before the quiet release

- [ ] ICO fee paid (§A), reference recorded.
- [ ] `videx.app` domain + `privacy@videx.app` mailbox live (§C).
- [ ] Worker deployed; `/privacy` + `/terms` reachable (§D).
- [ ] Policy URL in both store listings (§D).
- [ ] Play Data Safety + Apple App Privacy submitted (§E).
- [ ] (If notifications ship at launch rather than as a fast-follow) push-notifications policy slot finalised (§B).

*IN-XPS-014 is re-scoped under Decision 6 (registers already updated in PR #50). This checklist is roadmap item 0.1; the deferred paid review is the parked [solicitor-briefing-pack.md](./solicitor-briefing-pack.md).*
