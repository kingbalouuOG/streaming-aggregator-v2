# Videx — Monetisation Strategy Exploration

**Status:** v0.1 — Exploratory. Not locked. Forward-looking reference only.
**Version:** 0.1
**Date:** April 2026
**Purpose:** Capture early thinking on how Videx could eventually generate revenue, so that when the user base and data reach a scale where monetisation is viable (estimated 12–24 months from V2 rollout), there is a documented set of options to evaluate rather than a cold start.

**What this document is NOT:**
- A locked strategy. Nothing here commits Videx to any specific revenue model.
- A near-term action plan. No monetisation work is planned for the first 6–12 months post-V2.
- A commercial projection. Revenue estimates are directional, not forecasts.

**What this document IS:**
- A reference for strategic discussions when user base and data volume justify commitment.
- A record of the principles and constraints that any future revenue model must respect.
- A survey of what competitors do and what avenues are realistic for a UK-focused, solo-developer app.

---

## 1. Context and Constraints

### 1.1 Operating model

Videx is a solo-developer side project. Joe holds a full-time job and works on Videx in available hours. The goal for the first two years is **lifestyle revenue** — modest income that covers operating costs and rewards effort, not venture-scale growth.

This framing materially changes what "good" monetisation looks like. An approach that nets £20k/year with low operational overhead is more valuable than one that could theoretically net £200k/year but requires full-time attention, compliance burden, or sales effort.

### 1.2 Ruled-out models and why

**Monthly subscriptions:** rejected. Create friction on sign-up that would kill the top of the funnel before the product has validated its value. Sustain a perception of ongoing commitment that users resist for discovery tools. Out of line with the category — no credible streaming-discovery competitor runs a mandatory monthly sub.

**Freemium:** rejected. Forces a decision between crippling the free tier (which damages growth and reviews) or making the paid tier redundant (which kills conversion). The model tends to degrade both experiences. Poor fit for a discovery app where the value is network-effect-adjacent — more user data improves recommendations for everyone.

**£1/year upfront subscription:** considered and rejected during strategy discussion. The payment step itself is the barrier, not the price. Conversion rates for £1/year paywalls on unproven apps are realistically 2–5%, which caps the addressable user base at the very moment the product is trying to grow the dataset that makes it valuable to anyone else.

### 1.3 The product-monetisation tension

Videx's core promise is *"find stuff worth watching on services you already pay for."* This is a user-aligned promise: every subscription the user avoids adding is, in some sense, a product success.

Most streaming-discovery monetisation models (affiliate commissions in particular) pay the app for pushing users **into** new subscriptions. That pulls against the promise. Over time it corrupts ranking, home-page composition, and onboarding copy in small ways that users eventually notice. JustWatch has this tension visibly.

**Principle:** any revenue model adopted must not corrupt the recommendation engine or the home-page composition. Revenue features should be orthogonal to the core product logic, visually distinct, or strictly opt-in. Where this is not possible, the model should be rejected on product grounds even if the revenue is attractive.

### 1.4 Constraints summary

Any future revenue model must satisfy:

1. **Low operational overhead** — compatible with solo-developer, spare-time operation
2. **Product-aligned** — does not corrupt the recommendation engine or degrade UX for non-paying users
3. **UK-focused viable** — works with UK streaming market structure (public-service broadcasters, affiliate programme coverage, smaller market than US)
4. **Non-exclusive** — multiple models can run in parallel where compatible
5. **Graceful zero** — Videx survives and remains valuable if revenue is zero

---

## 2. Market Context

A survey of how comparable apps actually monetise, to ground the options in real commercial patterns rather than speculation.

### 2.1 JustWatch (Berlin, ~10M MAU, 283 staff)

Two revenue legs:
- **Consumer:** free app with banner ads, affiliate commissions on outbound clicks, optional Pro tier (~$2.50/month) that removes ads and adds custom lists. Affiliate revenue alone reported at roughly $1.7M/month historically, driven by ~25M page hits.
- **B2B ("Audience as a Service"):** the commercial engine. JustWatch Media licenses user-taste data and runs targeted trailer campaigns for film studios (Universal, Warner Bros., etc.) on YouTube and Facebook. This is where the real money is.

Lessons for Videx: the consumer product subsidises the data asset. The consumer revenue alone would not support the business. Affiliate + ads + cheap Pro tier is a proven but modest combination.

### 2.2 Reelgood (US + UK, ~10M MAU, VC-backed $11M raised)

Free consumer product. Primary revenue is **data licensing to ~50 B2B customers** including Roku (powers universal search), NY Post (article widgets), smart-TV manufacturers, and hedge funds (alternative data for entertainment-sector trading).

Lessons: the data asset is the real product. Consumer-facing app is the data-collection instrument. Works because they operate at scale with VC support.

### 2.3 Smaller competitors

- **Watchworthy, Simkl, TV Time, OneMovie:** mostly free + ads, some with optional cheap Pro tiers. None publicly disclose revenue; most appear to be lifestyle-scale or sub-scale businesses.
- **Letterboxd (film logging, adjacent category):** Pro (£19/year) and Patron (£49/year) tiers unlock statistics, no ads, and cosmetic extras. Sponsored content slots clearly labelled, sold to distributors and festivals. Widely regarded as the cleanest model in the category.
- **Plex Discover, smart-TV built-in guides:** bundled with hardware or media-server revenue; not directly comparable.

### 2.4 Pattern summary

Nobody credible charges mandatory upfront fees. Consumer revenue is predominantly free + optional upgrade. The commercial asset in every case is either the audience (for advertising) or the data (for licensing). The B2B leg is where sustainable revenue lives.

---

## 3. Candidate Revenue Models

Each option below is evaluated on: mechanics, revenue potential, product risk, operational effort, timing feasibility, and key unknowns.

### 3.1 Passive affiliate (deep-link tag preservation)

**Mechanics:** every outbound deep link Videx already emits (to Prime Video, Apple TV+, Disney+, NOW, etc.) is wrapped with an affiliate tracking tag. When a user clicks through and completes a qualifying action (sign-up, free trial, purchase), the merchant pays a commission. No changes to home-page composition, ranking, or onboarding. The feature is the deep-linking Videx already does — just monetised.

**Key UK programmes:**
- Amazon Associates UK (covers Prime Video and all Prime Video Channels: Paramount+, Discovery+, hayu, MUBI, Shudder, etc.) — £3 bounty per free trial sign-up
- Apple TV+ via Apple Services Performance Partners (Partnerize) — flat commission per subscription, stricter approval
- Disney+ via Impact or CJ — per-subscriber bounty
- NOW (Sky) via Awin — UK-focused
- Netflix, BBC iPlayer, ITVX, Channel 4: no affiliate programmes exist

**Revenue potential:** modest. At 10k active users with typical deep-link click-through rates, probably £50–300/month. At 50k active users, plausibly £500–2000/month. Capped because a meaningful share of UK viewing is on iPlayer, ITVX, All 4, and Netflix, which pay nothing.

**Product risk:** low if implemented passively. Risk rises if the temptation to "optimise" revenue introduces features that surface unsubscribed content (see Section 1.3). Principle: tag what's already emitted, don't redesign to emit more.

**Operational effort:**
- One-time: apply to programmes, build tag-insertion layer in deep-link code, disclosure UI, record-keeping for tax
- Ongoing: minimal; quarterly review of programme terms and consolidation of payouts

**Timing feasibility:** requires meaningful deep-link click volume. Amazon Associates has a **six-month first-sale rule** — account is terminated if no referred conversion occurs within six months of sign-up. Do not apply until deep-link traffic is sustained.

**Key unknowns (must validate before committing):**
1. **Tag preservation through `@capacitor/app-launcher`.** When Videx launches the Prime Video app via universal link or Android intent, does the `?tag=videx-21` parameter survive the handoff? If the OS strips it, attribution fails and the whole model collapses. **This is the single biggest technical blocker and should be spiked before any application to Amazon Associates.**
2. Programme approval for a mobile app with Videx's profile. Amazon explicitly scrutinises mobile apps; approval is not automatic.
3. UK ASA and ICO disclosure requirements in a mobile app context.

### 3.2 Data licensing

**Mechanics:** aggregate, anonymised taste and engagement data is licensed to commercial partners. Potential buyers:
- **Streamers' content acquisition teams** — what's trending, what's under-discovered, what combinations of taste correlate with retention
- **Research firms** (Ampere Analytics, Omdia, Parrot Analytics, etc.) — market intelligence for subscription clients
- **Film distributors and PR agencies** — audience targeting and marketing intelligence for new releases
- **UK public service broadcasters** (BBC, Channel 4) — commissioning and scheduling insight
- **Hedge funds and equity researchers** — alternative data for entertainment-sector trading (this is a real Reelgood customer category)

**Revenue potential:** potentially significant, but scale-gated. Meaningful licensing deals typically require minimum audience sizes (often quoted as 100k+ MAU for coarse demographic data, much higher for granular behavioural data). Below those thresholds, buyers don't take meetings.

**Product risk:** low if done correctly. Aggregate, anonymised data does not affect the consumer product. Risk is reputational if data practices are perceived as invasive. Must be covered by transparent privacy policy and GDPR-compliant consent.

**Operational effort:**
- One-time: data pipeline for aggregation and anonymisation, legal work on terms, sales/business development to find first customer
- Ongoing: customer relationship management, refresh cadence, customisation requests. This is **not** a passive model; each customer is a real B2B relationship.

**Timing feasibility:** 24 months minimum from V2 rollout, probably longer. Needs user scale, data depth, and reputation. Realistically, the first "deal" is more likely to be a published free report (see 3.3) that generates inbound interest than a direct sales effort.

**Key unknowns:**
1. Minimum user scale for commercial viability in the UK market specifically
2. Whether Videx's embedding-based taste data is genuinely differentiated enough to command a premium over JustWatch/Reelgood offerings, or whether it's a commoditised category
3. GDPR implications of monetising user behaviour, even aggregated
4. Solo-developer bandwidth for B2B sales and account management

### 3.3 Published aggregate insights (free marketing asset)

**Mechanics:** quarterly or half-yearly public reports — "UK Streaming Taste Report" — summarising anonymised aggregate trends from Videx usage. Published free on the Videx site or Medium. Distributed via press outreach to tech and entertainment journalists.

**Revenue potential:** zero direct revenue. Indirect value:
- Organic acquisition (press coverage drives installs)
- Reputational credibility that makes data licensing (3.2) feasible later
- Backlinks and SEO compound over time
- Serves as a working prototype for what paid data would look like

**Product risk:** none.

**Operational effort:** a few days per quarter to write and publish. Low.

**Timing feasibility:** viable as soon as there's enough data to say anything meaningful. Probably 6–12 months post-V2.

**Key unknowns:**
1. Whether UK-specific streaming data has enough journalistic interest to get picked up, or whether it's too niche
2. How much data volume is needed before aggregates are statistically defensible

**Recommendation:** this is the lowest-risk, lowest-effort item in the document and is almost certainly worth doing regardless of which direction the wider strategy goes. It builds the asset, doesn't compromise the product, and opens doors.

### 3.4 Sponsored content slots (clearly labelled)

**Mechanics:** a distributor or streamer pays a flat fee to place a new release in a dedicated, visually distinct "Featured" row on the home page. Always labelled as sponsored. Never mixed into personalised recommendations. This is how Letterboxd handles it and it's the cleanest version of direct consumer monetisation in the category.

**Revenue potential:** moderate at scale. Typical CPM rates for entertainment-category in-app advertising are £5–30 depending on audience quality. A 50k-MAU app with a weekly sponsored slot might generate £500–2000/month.

**Product risk:** moderate. Depends entirely on discipline about labelling and visual separation. Done well, it's transparent and users accept it. Done badly, it corrupts trust.

**Operational effort:**
- One-time: design and build the sponsored-row component, labelling system, ad-serving or direct-sales workflow
- Ongoing: either direct sales (high effort, high margin) or programmatic fill via an ad network (low effort, lower margin)

**Timing feasibility:** requires scale. Distributors don't pay for slots below ~50k MAU. Probably 18–24 months out.

**Key unknowns:**
1. Whether direct sales is feasible as a solo developer, or whether a network fill is the only viable route
2. Whether UK-focused distribution has enough buyers to make this worth the effort
3. User tolerance — needs careful user research

### 3.5 API or white-label licensing

**Mechanics:** Videx's recommendation engine (not just the data) is licensed to third parties. Potential forms:
- **API access** for publishers who want to embed personalised "what to watch" widgets in their articles
- **White-label recommendation service** for smaller streaming platforms or smart-TV manufacturers who don't have their own
- **Editorial tool** for UK publications currently producing "what to watch this week" lists manually

**Revenue potential:** potentially high per customer (typical B2B API deals are £500–5000/month per customer), but requires productisation effort and ongoing support.

**Product risk:** low — fully orthogonal to the consumer product.

**Operational effort:** high. This is a real B2B product. Requires API design, documentation, authentication, SLAs, customer support. Not a spare-time proposition unless carefully scoped.

**Timing feasibility:** 24+ months. Requires proven recommendation quality, reference customers, and productisation. Reelgood's NY Post widget is the template.

**Key unknowns:**
1. Whether the recommendation engine, once hardened, is genuinely differentiated enough to license vs. just using TMDb's built-in recommendations
2. Solo-developer capacity for B2B support
3. Whether a tightly-scoped single use case (e.g., "widget for UK entertainment publishers") is feasible as a minimal product

### 3.6 Voluntary support (Pro tier, Patron tier, donations)

**Mechanics:** optional one-time or annual payment that unlocks minor extras — ad-free if ads exist, unlimited custom lists, early access to new features, profile badge. Not gating core functionality. Modelled on Letterboxd Pro/Patron and the old Apollo for Reddit approach.

**Revenue potential:** modest and conversion-dependent. Letterboxd reports that 2–5% of active users convert to paid tiers. For Videx at 50k MAU and £15/year, that's £15–40k/year.

**Product risk:** low if designed purely as "support the project" rather than "unlock features." Risk rises if the feature gate gets tempting.

**Operational effort:** one-time: payment integration (Stripe, RevenueCat), entitlement system, Pro-tier UI. Ongoing: minimal.

**Timing feasibility:** viable once there's a clear "indie project" narrative and an active user base that identifies with it. Probably 12+ months post-V2.

**Key unknowns:**
1. Whether Videx can sustain the indie-developer narrative that makes this model work (as opposed to being perceived as a commercial product)
2. What the Pro tier actually contains without becoming feature-gating
3. Pricing — £10, £15, £20/year are all defensible

---

## 4. Recommended Sequencing

Not a locked plan — a sketch to anchor future strategy discussions.

### Phase M0: 0–6 months post-V2 (Instrumentation only)

- No monetisation. Zero revenue assumed.
- Instrument for future options: log affiliate-click events (with empty tag), track deep-link click-through rates by service, record engagement depth metrics
- Keep operational costs low enough that zero revenue remains survivable
- Spike the **tag preservation technical question** (Section 3.1) so the data exists when decisions are made
- Resist product compromises for unvalidated revenue models

### Phase M1: 6–12 months (First reversible experiments)

- Publish the first **aggregate taste report** (3.3) as a marketing and reputation experiment
- If sustained deep-link traffic exists and tag preservation works, apply to **Amazon Associates UK** (3.1) for passive affiliate. Strictly tag-what-already-exists — no new product features to push subscriptions
- Evaluate a lightweight **voluntary support** path (3.6) if user feedback and engagement justify it

### Phase M2: 12–24 months (Compounding the data asset)

- Scale affiliate to additional programmes (Awin, Apple Partnerize) if year-one data justifies the effort
- Continue publishing reports; measure whether inbound interest from research firms or distributors emerges
- Evaluate **sponsored slots** (3.4) if user base is at ~50k MAU
- Begin exploratory conversations with research firms about **data licensing** (3.2)

### Phase M3: 24+ months (Evaluate scale-dependent options)

- If scale and retention justify it, pursue formal **data licensing deals** (3.2)
- Consider **API or white-label** (3.5) only if a clear single use case emerges organically
- Re-evaluate whether the "lifestyle revenue" frame still applies or whether the project warrants more commitment

**Critical principle:** each phase's decisions should be justified by data generated in the previous phase. Do not commit to M2 options until M1 data is in. Do not commit to M3 options until M2 data is in.

---

## 5. Open Questions to Revisit

Questions that cannot be answered now but must be answered before committing to specific models.

**Technical:**
- Does the Amazon Associates `?tag=` parameter survive `@capacitor/app-launcher` handoff on iOS and Android? *(blocker for 3.1)*
- Can Videx's embedding-based data be meaningfully aggregated without re-identifying users? *(blocker for 3.2)*
- What's the minimum data volume for publishable aggregate reports? *(blocker for 3.3)*

**Commercial:**
- Is the UK streaming-data market large enough to support a licensing business at Videx scale, or is the realistic buyer set a handful of firms?
- Does Videx's recommendation engine have genuine differentiation over TMDb-based competitors that would justify API licensing?
- What's the UK affiliate click-through rate for discovery-app traffic specifically? *(model inputs for 3.1)*

**Legal and regulatory:**
- UK ASA disclosure requirements for affiliate links in mobile apps
- ICO and GDPR implications of monetising behavioural data, even aggregated and anonymised
- VAT and tax implications of affiliate income as a sole trader

**Strategic:**
- Does the "lifestyle revenue" frame remain correct if the app grows faster than expected? At what point does it flip to "this is now my job"?
- How much product purity is Videx willing to trade for revenue? (The Section 1.3 tension will return in every decision.)

---

## 6. What Success Looks Like

Deliberately kept simple:

- **Year 1 post-V2:** Videx is live, gaining users, and instrumented. Zero monetisation revenue. Operating costs fully covered by personal funds. First aggregate report published.
- **Year 2:** Affiliate live if validated. Second and third aggregate reports published. Voluntary support tier live. Revenue covers operating costs and provides modest supplementary income.
- **Year 3:** Revenue model (or mix) is providing meaningful lifestyle income. Data licensing conversations are real. The decision about whether to scale beyond lifestyle is informed by actual evidence.

Anything more ambitious than this at the outset is speculation dressed as planning.

---

## 7. Revision Notes

- **v0.1 (April 2026):** Initial exploration. Written during V2 Phase 0. Not reviewed by anyone other than Joe and Claude. To be revisited once V2 is live and user data exists to test the assumptions above.
