# Videx — Product Strategy & Roadmap

**v1.0 — APPROVED by Joe, 6 July 2026.** This is the working product strategy and roadmap. It supersedes: the February 2026 Notion roadmap, the Monetisation Strategy Exploration v0.1 (absorbed into §5), and the v3 Conversational Discovery Strategy v0.1 (absorbed into H3 Bet 1).
**Rendered copy:** https://claude.ai/code/artifact/1ec8d533-7d33-45b8-9f11-ae2e128f0fc4 · **Wiki snapshot:** `videx-wiki/raw/forward-planning/Videx_Product_Strategy_and_Roadmap_v1.0_2026-07.md`
**Provenance:** built 5–6 July 2026 from the codebase (v2.0.2), videx-wiki registers, Notion project, Supabase production data, and fully-cited July-2026 market research. Three independent critique passes (strategy · feasibility-vs-codebase · external fact-check) + a consistency pass; Joe's five decisions (6 Jul), the loops-into-H0 resequence, and the independent H3 vision review (ideation + 2026 frontier research) are incorporated.

---

## 0. TL;DR

Videx is technically ahead of every consumer competitor on the thing that matters most — genuine per-user taste modelling with UK-first data quality — and it is live on both stores' internal tracks. But it has **5 users**, and every remaining engine milestone (learned re-ranker, collaborative filtering) is explicitly gated on usage data that doesn't exist yet. **The engine is ahead of the audience. Users are now the critical path — not features.**

The market is unusually validating: 66% of streamers say they want a single cross-service guide, time-to-decide keeps rising, subscription cycling is normalised, and the mobile "what should we watch tonight?" moment is owned by nobody. Meanwhile the category's free-forever players are dying (TV Time shuts down 15 July 2026) and incumbents are monetising clumsily (Trakt's up-to-300% price hike backlash). The lesson: charge early and fairly — but only once the maths works.

**The roadmap in one line:** clear the legal blocker, fix measurement, **build the two missing loops** — free arrival alerts for retention, share links + title pages for growth — shake out with friends & family, and go **quietly live on both stores with those loops in v1** (H0, Jul–Sep) → recruit openly in UK communities against a real store listing, prove strangers activate, then spend the marketing moment in the pre-Christmas run-up (H1, Oct–Dec) → the "worth it this month" rotation coach in peak subscription-review season, a fair £15/yr Premium once MAU reaches the ~5–8K break-even band, and the learned re-ranker as its data gate clears (H2, Jan–Mar 2027) → then the vision bets: the agent-callable taste layer, subscription autopilot, group "Tonight" links, and owning the UK availability truth (H3).

*(Store availability ≠ launch moment. Joe's call, 6 Jul: TestFlight/closed-track invites are friction and look dodgy to strangers — communities should meet a real store listing. The press beat is spent later, when the retention and growth hooks are live.)*

Three things this plan refuses to do: paywall the retention loop, start ML work before its data gate, or pretend a launch is a growth strategy.

---

## 1. Where we are — evidence, not vibes

### 1.1 Product state (strong)

| Area | State |
|---|---|
| Apps | Native RN/Expo app `app.videx.streaming` v2.0.2, live on Play **internal testing** + iOS **TestFlight**. Tag-triggered CI builds and submits both stores. Public release is a promotion/review step, not an engineering project. |
| Engine | v2 complete + hardened: 1536D embeddings, multi-interest centroids (K≤3), avoid-set, exploration slots, MMR diversity, contextual scoring, server-rendered For You via Cloudflare Worker + KV cache + nightly recompute. |
| Content | 22,864 titles, ~75K availability rows, 69 mood rooms, 10 UK services with curated deep links, rent/buy pricing, daily incremental sync. `streaming_history` (52K rows) logs adds/removals, and `streaming_availability.expires_on` already carries **forward-looking leaving-soon dates for ~2,000 titles** — the raw material for alerts exists today. |
| Surfaces | Home (editorial + calendar strip) · For You (personalised, sliders, mood rooms) · Browse (keyword + flag-gated semantic mood search) · Watchlist · Profile (spend dashboard, GDPR export/delete). |
| Signals | `deep_link_click` already captured with service, URL, dwell, confidence, position and origin surface — the north-star metric is measurable **today** (two small gaps: persist link type; capture price shown). |
| Compliance | GDPR Art. 17/20 done. Privacy Policy + ToS drafted, **not solicitor-reviewed** — the hard public-launch blocker (IN-XPS-014). |

### 1.2 Usage reality (the honest bit)

5 registered users (first: 13 June 2026), 3 with interactions, 68 interaction events, 7 watchlist rows, ~2.1K June card impressions. Two pieces of real feedback: one 5-star "Looking awesome!", one bug report (mark-watched — UI fixed in PR #35). **This is friends-and-family, pre-launch scale.** The ENG-2 data gate (≥5–10K impressions, ≥500 positive outcomes) is roughly 50–100 active users away.

### 1.3 Found during this review (fix before scaling the beta)

- **Onboarding funnel instrumentation is broken on native**: `onboarding_started` fires before a session exists and gets dropped; only `onboarding_completed` lands, with duration hardcoded to 0. Step events don't exist on native. Until fixed, activation cannot be measured.
- **No crash reporting** (no Sentry/Crashlytics anywhere) — beta feedback like "it froze" will be undiagnosable, and no "crash-free" gate is measurable without it.
- **`editor_notes` doesn't exist in production** (migration 040 never applied) while native Home references it — verified against the live DB. Either apply + seed it or remove the dead path.
- **Taste-vector dedup gap** (known, unfixed): neither the incremental nor the recompute path dedups repeated events — the PR #35 incident skewed a real tester's vector, and any future **importer feature would mass-replay watched history straight into this hole**. Prerequisite for both clean beta measurement and H1/H2 importers.
- **The data-quality hedge is unused**: `availability_reports` has 0 rows ever. The mitigation for our #1 strategic risk needs a working end-to-end loop.
- **Password reset**: the email sends, but the in-app reset screen was deferred and the link lands wherever the Supabase Site URL points — with no deployed web surface this may be a dead end. Verify E2E before recruiting strangers.

### 1.4 The two missing loops

- **No retention loop.** Zero push-notification infrastructure (confirmed: no expo-notifications, no FCM/APNs config). Arrival/leaving-soon alerts are the category's stickiest features.
- **No growth loop.** No share sheet, no referral, no web surface for SEO. A user who loves Videx has no low-friction way to show anyone.

---

## 2. What the market is telling us (July 2026)

Full citations in Appendix A; headline signals:

1. **The problem is consumer-validated.** 66% of streamers want a single guide across their services; global average time-to-decide is 14 min/session (US 12, France 26; no UK-specific cut published); 19% abandon sessions entirely (29% of 18–24s); 49% would cancel a service over poor discovery (Gracenote/Nielsen, Nov 2025).
2. **The UK is a stacking-and-cycling market.** 20.6m UK SVoD households (69.7%, Barb Q4 2025); a record ~14.1m with 2+ services (Barb Q1 2025) — the fragmentation-pain segment Videx targets. 32% have cancelled one service to fund another (YouGov, Apr 2026); cost is the #1 churn driver (70%); US data suggests roughly 40–50% of cancellers eventually resubscribe (Deloitte/Ampere). Deloitte's UK 2023 read: 21% cancelled an SVoD that year — cycling has been structural since the cost-of-living squeeze.
3. **Ad tiers complicate "what am I paying for".** 87% of Prime, 38% of Netflix, 35% of Disney+ UK subscribers are on ad tiers (Barb Q4 2025; still climbing in Q1 2026); bundles are ~26% of the market (Kantar Q1 2025). Tier-accurate availability and spend transparency get more valuable every quarter.
4. **The decision moment lives on the phone; nobody owns it.** Only ~19% know what they'll watch before the TV goes on (TiVo survey, ~2021 — old but directionally durable); Nielsen has long put second-screen use near 88%. Netflix's April 2026 mobile redesign (vertical "Clips" feed, US/UK among first markets) shows where Netflix thinks the decision happens — but it only recommends Netflix. TV-OS universal search (Google TV/Gemini, Apple TV app, Sky Glass, Fire TV) owns the couch, is structurally conflicted, and is incomplete — Netflix still boycotts Apple's aggregation; iPlayer/ITVX integrate patchily. Freely (1M+ weekly users) is broadcaster-only and **has no mobile app**.
5. **Free-forever consumer plays are dying.** TV Time (26M+ lifetime installs) shuts down 15 July 2026 — "not sustainable as a free app". Struum dead (2023), Oneflix delisted (Feb 2025), Reelgood leans increasingly B2B while its consumer app stagnates. Survivors either own data at massive scale (JustWatch: B2B studio campaigns; ~$1–2/user/yr, estimate), community (Letterboxd: 26M+ users), or charge properly from small scale (Callsheet, ~$9/yr, sustainably solo).
6. **Data supply is the top strategic risk.** JustWatch's API is prohibited for commercial use and licenses only to "bigger partners"; TMDb's watch-provider data *is* JustWatch data (attribution required; deep links deliberately excluded) and **commercial use of TMDb requires a ~$149/month licence** (under $1M revenue / 2M users). The SA API (Movie of the Night) remains the only self-serve, commercially usable deep-link source at indie scale. Videx's Supabase cache + availability-report loop is the right hedge — treat it as a strategic asset.
7. **Regulation is a tailwind.** UK Media Act prominence regime and EU DMA pressure both push toward open, deep-linkable discovery. CMA action is actively improving Premium economics: Google Play moved to 10% (first $1M) + optional 5% payment fee with steering removed (live in UK since 30 June 2026); Apple's UK steering conduct requirement is in consultation until 28 July 2026 (a parallel Google consultation runs alongside). Apple Small Business Program stays 15%.

**Sizing sanity check (ceiling, not forecast — no gate or revenue commitment references it):** ~14.1m multi-service UK households → ~18m adults expressing the single-guide need. A well-executed indie taking 0.5–3% over ~3 years implies ~90K–500K MAU. JustWatch's claimed 60M global MAU is the existence proof — earned over a decade, riding an SEO web moat.

---

## 3. Competitive position

### 3.1 Where Videx is genuinely ahead

- **True taste personalisation.** Embedding-based per-user taste vectors with interaction learning. Only Plex's brand-new "Match Score" (June 2026) and Likewise's Pix even attempt this; JustWatch/Reelgood/Trakt are filter- or popularity-driven. The deepest moat — it compounds with usage.
- **UK-first data quality.** First-class iPlayer/ITVX/C4 treatment, per-service deep-link curation, tier-aware pricing. Every global player treats UK free broadcasters as second-class; even Apple's own aggregation has long-running iPlayer bugs.
- **Trust posture.** Ad-free, privacy-forward, no sponsored placements inside recommendations — a direct contrast with JustWatch (sponsored rows) and platform-native aggregators (structurally conflicted).
- **Mood/semantic search** (built, flag-gated) — no mainstream competitor has it on mobile.

### 3.2 Where Videx is behind (table stakes)

| Gap | Who has it | Why it matters |
|---|---|---|
| Arrival notifications ("now on your services") | JustWatch (**free**), Reelgood, Trakt, Plex, Letterboxd (paid) | The category's #1 retention feature; Videx has zero notification infra |
| Leaving-soon alerts | JustWatch **Pro** ($2.49/mo); Letterboxd says it *can't* (no advance warning from providers) | Videx's `expires_on` data makes this buildable — and it's the category's proven *paid* tier anchor |
| Dedicated calendar screen | Most trackers | Native has a Home calendar strip already; a see-all screen is small |
| Import (Trakt/Letterboxd/TV Time) & visible export | Trakt, Simkl; JustWatch shipped a TV Time migration tool within days of the shutdown news | Refugee capture + the new trust criterion ("will my data survive?") — gated on the dedup fix |
| Sharing (even a share sheet) | Everyone | No growth loop at all today |
| Episode-level tracking | Trakt/Simkl/Serializd core | **Deliberately out of scope** (anti-persona) — "smart mark-watched" needs a decision instead |

### 3.3 Category events worth exploiting

- **TV Time dies 15 July.** JustWatch already shipped a migration tool, and Videx isn't publicly launched — chasing this window directly is theatre. The durable plays: importers as permanent trust features (H1/H2, after the dedup fix), and refugee messaging aimed at the **ongoing** Trakt stream (up-to-300% price hike, disliked v3 redesign) rather than a 10-day event.
- **Plex going social + hiking prices** (lifetime $749.99 from 1 July) validates discovery-as-destination while annoying its base.
- **Letterboxd for sale** (Tiny's ~60% stake, per Semafor) and **Fox buying Roku for $22B** (June 2026) — the aggregation layer is consolidating into media owners whose recommendations are conflicted by design. Independence is becoming rarer, and more valuable.

### 3.4 The defensible wedge (priority order)

1. **UK-first accuracy + deep-link quality** — structurally ignored by global players.
2. **True personalisation** — compounding moat; years ahead of filter-based incumbents.
3. **Subscription-value / rotation coaching** ("which service is worth it this month?") — the largest unclaimed need; impossible for platform-owned aggregators (conflict of interest), unattractive to JustWatch (its customers are the services). Perfectly aligned with Videx's spend dashboard + watchlist + availability history.
4. **Decide-together** — blended two-person taste sessions; swipe-match apps prove demand, nobody has real taste models to do it properly.
5. **Trust** — exportable data, no ads, transparent recommendations, "we survive shutdowns" positioning (newly salient post-TV Time).

---

## 4. Strategy

### 4.1 Vision (the long game)

**Videx becomes the taste layer for UK streaming: the app that knows what you love across every service you pay for, and answers "what should we watch tonight?" better than any single platform can.**

The platforms each know a slice of you and are paid to push their own catalogue. The TV OSes own the glass but are conflicted and blind to Netflix. Videx sits with the user — on the phone, where the decision actually happens — and compounds a cross-service taste graph no platform can see. The endpoint is a taste layer that is **callable**: "what should we watch tonight?" answered from *your* taste graph and *your* services, **wherever the question is asked — in the app, in a group chat, or inside whichever assistant the user already talks to.**

### 4.2 Positioning (now)

> **For UK households juggling 2+ streaming services** who lose most of an evening's start deciding what to watch, **Videx** is the free, ad-free app that learns your taste and tells you what's worth watching tonight — across everything you already pay for, with one tap straight into the right app. **Unlike JustWatch or your TV's home screen**, Videx has no sponsored rows and treats iPlayer, ITVX and Channel 4 as first-class citizens.

Primary personas: **P1 multi-subscriber juggler** and **P4 drift-checker** (the ~14m-household mainstream). **P3 cinephile hunter** is the early-adopter beachhead — mood rooms and taste depth resonate most, and they evangelise. P2 broadcaster loyalist is served, not led with.

### 4.3 Operating principles (unchanged, now with teeth)

1. Privacy-forward; no third-party data sharing.
2. 20–25% exploration reserved in every surface.
3. Recommendation-first, not search-first.
4. Deep-link-out is the success state.
5. **Revenue must never corrupt the engine** — no paid placement in personalised surfaces, no paywalling the core loop (where-to-watch, recommendations, watchlist, deep links, arrival alerts), affiliate must never re-rank.

### 4.4 North star & metric tree

**North star: Weekly Watch Decisions (WWD)** — deep-link clicks, plus mark-watched events within 7 days of a Videx impression or detail view of that title (excludes bulk history-logging). Track **WWD per WAU** alongside the absolute number so user growth can't masquerade as product improvement. The `deep_link_click` event already carries service, position and origin surface — **WWD is measurable from day one of the beta.**

| Layer | Metric | Note |
|---|---|---|
| Activation | Signup → onboarding complete → ≥1 positive action (watchlist add / deep-link click) within 7 days | Baseline in beta; H0 measures it, H1 iterates it |
| Retention | W1 / W4 return rate | Utility-app W4 norms are brutal (~10%); free arrival alerts are the lever |
| Engine quality (Tier 1, already defined) | Detail-view rate @10 · Watchlist conversion @10 · Deep-link CTR | Baseline in H0 beta — these gate launch, see H0 exit |
| Scale gates | Impressions + positives | ENG-2: ≥5–10K impressions & ≥500 positives · CF: ~10K MAU |

Summer note: H0 baselines land in the July–August viewing trough — treat them as seasonally low; don't hard-code targets off them.

---

## 5. Monetisation recommendation

**Recommendation: a fair, feature-backed Premium (~£14.99/yr, annual-first, 7-day trial) as the core revenue engine — this is the April exploration's "voluntary support" candidate upgraded with real features, not the freemium that document rightly rejected. Launch it when scale clears the compliance-cost floor (see below), with affiliate as passive floor revenue and native sponsorship + B2B data experiments at 50–100K MAU. No programmatic ads, ever.**

**The free/paid boundary (load-bearing — Decision 2, confirmed 6 Jul: nothing core is ever paywalled; paid means genuinely premium, spend-justifying additions):**

- **Free forever:** where-to-watch, recommendations, watchlist, deep links, mood search — and **arrival alerts** ("X from your watchlist just landed on your service"). Arrival alerts are the retention loop and a taste-signal source; JustWatch gives them away free, so charging for them is strategically impossible anyway.
- **Premium:** leaving-soon alerts (JustWatch charges for exactly this; Letterboxd *can't* build it — Videx's `expires_on` data can), price-drop alerts, stats/year-in-review, advanced filters, unlimited lists, themes/app icons.

**The switch-on maths (why Premium is MAU-gated, not calendar-gated):** the moment Videx takes revenue it becomes a commercial app — triggering the TMDb commercial licence (~$149/mo ≈ £1.4K/yr), an SA API paid tier sized to traffic, and affiliate/premium admin. Call the floor **~£1.5–2.5K/yr**. Using payers ≈ 1.5–2.5% of actives as rough planning shorthand (RevenueCat 2026's median is 2.0% of *downloads* paying by day 35, top quartile ~4.5–6% by category/geography — the mapping to MAU is approximate), Premium at £14.99 nets roughly £1–1.7K/yr at 5K MAU after store fees. **Break-even sits around 5–8K MAU.** So: build all plumbing in H1 (cheap, invisible), launch Premium **once MAU is inside that 5–8K band and climbing**. *(Decision 1, resolved 6 Jul: MAU-gated confirmed; no early paid experiment.)* Framing note from Joe: monetisation is a sustainability lever, not the goal — the product's job is to add value, and the compounding user/taste data asset matters more than early subscription revenue. The roadmap treats revenue accordingly: plumbing early, switch-on only when the maths clears.

**Affiliate reality check (UK, 2026):** Netflix/iPlayer/ITVX/C4 pay nothing — and Videx's best users click into services they *already have*, which pays nothing either. Commissionable events are rent/buy transactions, Prime Video Channels trials, and occasional new-service signups. Amazon ~£3 trial bounties + ~5% rent/buy; Disney+ and Paramount+ via Impact (network-gated rates — verify at application); Apple 7% on rentals via Partnerize; NOW via Awin. Realistic yield **~£0.05–£0.15 per MAU per year** (worked bottom-up from click-out rates and consistent with JustWatch's ~$1–2/user/yr *including* its dominant B2B leg) — a floor, not a business. Implementation: a **server-side redirector on the existing Worker** (`GET /out` → 302 with tags appended server-side, destination-allowlisted to avoid an open redirect). This settles the old "does ?tag= survive AppLauncher?" spike — web destinations route through the redirector; app-to-app deep links aren't commissionable anyway. Mind Amazon's mobile-app approval and 3-sales/180-days rule — apply only when traffic exists.

**Revenue math (planning figures, not forecasts):** 5K MAU → Premium ~£1–1.7K/yr net + affiliate ~£250–750/yr — roughly break-even against the cost floor. 100K MAU → Premium ~£20–40K net (£50K+ only with top-quartile conversion) + affiliate £5–15K + sponsorship/newsletter £5–20K. Lifestyle income needs ~20–50K MAU; "graceful zero" holds throughout.

**Compliance gates before switching anything on:** TMDb commercial licence + JustWatch attribution review; SA API paid tier; ASA/CMA affiliate disclosure copy; privacy policy covering click-out logging **and** push tokens/notification consent — fold both into the single solicitor pass (H0), so legal isn't paid twice.

---

## 6. The roadmap

Four horizons at side-project pace — now calibrated to Joe's stated capacity (Decision 3, 6 Jul): half a day to a day at weekends plus up to ~2 hours on weekdays when work allows, i.e. a variable ~6–16 hours/week. Lesson from the critique pass: previous drafts were ~2× overloaded, so each horizon now has **committed** items (do these) and a **stretch** pool (only if committed is done). Horizons end with exit gates — don't start the next until the gate is met, and every H1+ item must grow users, retention, or revenue.

### H0 — "Prove it & equip it" (July–September 2026) · theme: measurement, legality, the two loops, quiet v1 release

Fix what's unmeasurable, clear the legal blocker, **build notifications and share into v1** (Joe's call, 6 Jul: the loops are too important to launch without), shake the app out with people who'll forgive rough edges — then put v1 quietly on both stores so community recruiting in H1 meets a real listing carrying real hooks. Honest sizing: the loop builds roughly double H0's load, hence ~10–12 weeks at stated capacity. The quiet release has no external deadline, so the trade is sound — but nothing else creeps into H0.

**Committed:**

| # | Item | Size | Notes |
|---|---|---|---|
| 0.1 | **Solicitor review of Privacy Policy + ToS** — one pass covering current app **+ click-out logging + push tokens/notification consent** (spec the notifications data model first via 0.9); decide contact address (registered-office service ~£30–50/yr) | M, calendar-bound — start this week | THE public-launch blocker (IN-XPS-014) |
| 0.2 | **Fix onboarding funnel events on native** — queue `onboarding_started` post-auth, add step events, real durations | S | Activation is unmeasurable today |
| 0.3 | **Complete click-out telemetry** — persist `link_type` (computed but dropped today), add `price_shown` | XS–S | deep_link_click already rich; this finishes the north-star metric |
| 0.4 | **Crash reporting** (sentry-expo) + basic release health | S | "It froze" must be diagnosable; gate metric depends on it |
| 0.5 | **Taste-vector dedup fix** (both incremental + recompute paths) | S–M | Clean beta reads; hard prerequisite for importers; protects ENG-2 training data |
| 0.6 | **Friends-&-family shakeout (~10–15 testers)** on the existing internal tracks — no stranger recruiting to TestFlight/closed tracks (Decision 4: strangers meet the store listing in H1 instead); "active tester" = ≥2 sessions + ≥1 positive action in week 1 | M | Bug shakeout + first measurement sanity check (incl. alerts on real devices); may double as Play's closed-test requirement (see 0.12) |
| 0.7 | **Weekly ritual (recurring):** feedback triage (app_feedback + availability_reports) + funnel/Tier-1 dashboard + **2h growth block** | S weekly | The learning loop is the point of H0 |
| 0.8 | **Beta-blocking fixes**: password-reset E2E (in-app screen deferred; Site URL question), editor_notes 040 apply-or-remove (table confirmed missing in prod), availability-report prompt verified end-to-end | S–M | Stranger-proofing |
| 0.9 | **Notifications v1 — full build (moved from H1, Joe's call 6 Jul)**. First-fortnight slice: data model (push tokens table, consent UX) so 0.1's legal pass covers it. Then delivery: EAS FCM/APNs credentials, Expo Notifications, push-token storage, Edge cron, tap routing — (a) **arrival alerts**: watchlist title lands on user's service (`streaming_history` 'added' × watchlist × user services); (b) **leaving-soon**: read `expires_on` (~2K titles carry dates; don't infer from history). Free for everyone (Premium split later per §5). Known blind spot: manual bulk syncs write no history events — the pipeline must tolerate that. | L–XL | The category's #1 retention feature, now shipping *inside* v1 |
| 0.10 | **Share v1 + minimal title pages (moved from H1, Joe's call 6 Jul)**: native share sheet → per-title web landing (one Worker route: OG tags, poster, where-to-watch snapshot, store links). Also the **SEO seed** — JustWatch's acquisition engine in miniature. | M–L | The growth loop ships inside v1 |
| 0.11 | Security + ops batch: leaked-password toggle (minutes), IN-PX-29 rate limit, IN-PX-30 JWT hardening, off-site backup, GitLab mirror, pg_partman check (overdue), pricing refresh (overdue), IN-PX-50 backfill function; note IN-XPS-004 JWT rotation stays tracked-blocked on Supabase tooling | M total | Cheap insurance; most gate the public release |
| 0.12 | **Quiet v1 public release**: verify Play production-access prerequisites first (personal dev accounts created after Nov 2023 need a 14-day closed test with 12+ testers before production — check which applies; 0.6 doubles as it if needed) · store-listing polish (screenshots, copy, ASO keywords — the listing IS the H1 acquisition funnel) · first App Store review with pre-submission guideline check (external rent/buy links = 3.1.1/3.1.3 territory) + one rejection-cycle buffer · staged/percentage rollout on Play · **no press, no announcements**. **Release valve:** if platform credentialing drags notifications more than ~2 extra weeks, release without them and fast-follow — the release must not slip indefinitely. | M–L | Store availability ≠ launch moment; early ratings are permanent, so the shakeout (0.6/0.8) lands first |

**Growth workstream (starts now, runs forever — Decision 3: organic only, no paid spend until channels are measured):** wave 1 = personal network + friends-of-friends for the shakeout; wave 2 (H1, post-release) = public UK communities pointed at the real store listing — r/CordcuttersUK, r/BritishTV, MoneySavingExpert forum threads where self-promo rules allow — plus social-content experiments (short-form "what to watch tonight" content; Gen Z discovery already lives there); ongoing = Trakt-refugee threads. Per-channel yields are guesses until tried — that's what the weekly growth block measures.

**Exit gate:** legal cleared · funnel + crash instrumentation live · **arrival + leaving-soon alerts firing on real data** · **share → title page → store round-trip works** · friends-&-family shakeout done with no open P0s · crash-free ≥99% · **quiet v1 live on both stores with the listing polished.** The activation read and engine pulse move to H1's community wave — strangers recruited against the store listing are the honest test.

### H1 — "Grow & learn" (October–December 2026) · theme: community-led acquisition, then the marketing beat

v1 is already quietly live **with both loops on board** (H0). H1's order: **community rollout + activation read → iterate on what strangers reveal → marketing beat in the pre-Christmas run-up** (the press moment is spent once; spend it on an app that pings and shares).

**Committed:**

| # | Item | Size | Notes |
|---|---|---|---|
| 1.1 | **Community rollout + activation read**: post into the growth-workstream channels against the live store listing; grow to 30–50+ stranger-users; measure activation + Tier-1 baselines + **engine pulse** (≥40% "very disappointed if Videx disappeared"). **Written branch: if the pulse fails, H1 becomes cold-start/onboarding iteration — no marketing beat until it passes.** | M (recurring) | The honest test the friends-&-family shakeout can't give |
| 1.2 | **Monetisation plumbing (invisible)**: Worker `/out` redirector (allowlisted); **server-verified entitlements table** (RevenueCat webhook → SELECT-only RLS — the per-user feature-flag table is client-writable and must NOT gate Premium); RevenueCat SDK; staged affiliate applications (Awin/Impact first; Amazon only once volume clears the 3-sales rule) | M | Makes H2 monetisation a config change; fixes a real security trap |
| 1.3 | **Semantic search flip**: author IN-PX-40 20-query fixture → eval green → bulk-enable flag + new-signup default (per IN-PX-41 — it's a per-user table, not a global toggle) | M (fixture is Joe-paced) | A differentiator sitting 90% finished |
| 1.4 | **ASO iteration + review prompts** (timed post-positive-signal) + growth block continues | S recurring | Compounding acquisition |
| 1.5 | **Marketing beat (once 1.1's pulse passes)**: narrative "UK-first, ad-free, actually knows your taste." Press list: Cord Busters, TechRadar UK, Trusted Reviews, Pocket-lint; Product Hunt; refugee threads. Timed for the pre-Christmas run-up. | M | The one press moment — spent on an app that already pings and shares |

**Stretch:** dedicated calendar screen (native strip exists; see-all screen is S) · importers (Trakt/Letterboxd CSV — **only after 0.5 dedup fix**; TV Time file support for users who saved exports) · ENG-2 prep dashboard (per-row CTR/save-rate). *(Paid ads: per Decision 3, no monthly spend until organic channels are measured — an Apple Search Ads test is an H2-entry question at the earliest, and only with early traction evidence.)*

**Exit gate:** engine pulse passed on stranger-users · marketing beat executed · notification opt-in >60% · W4 retention baseline known · growth engine running with per-channel numbers · ENG-2 data gate passed or in sight. MAU is tracked but not gated here — weeks-old public availability is too early to judge; the H2 entry review owns that call.

### H2 — "Retention deepens, revenue begins" (January–March 2027) · theme: the wedge features; money if the maths works

**Committed:**

| # | Item | Size | Notes |
|---|---|---|---|
| 2.1 | **Rotation coach v1 — "Worth it this month"**: per-service value score from watchlist + taste-fit + spend dashboard ("6 watchlist titles on NOW; nothing new for you on Disney+ — consider pausing"). Instrument feature-usage events from day one (they feed the H2 exit gate). | L | The flagship differentiator; conflicted incumbents cannot copy it. January = peak subscription-review season (post-Christmas bills, new-year resets). |
| 2.2 | **Premium launch — IF MAU is in the ~5–8K break-even band** (per §5 maths; else defer or run consciously as a paid experiment — Decision 1): leaving-soon + price-drop alerts, stats ("your first 3 months on Videx" — a 6-week-old user base can't carry a year-in-review), advanced filters, themes. Beta users grandfathered. | L | Trial-first, annual-first; success gate: ≥1.5% of new downloads paying by D35 (trial-inclusive), trial→paid ≥30% |
| 2.3 | **ENG-2 learned re-ranker — IF the data gate passes** (LR over pipeline features, nightly training, offline AUC/NDCG gate before serve; exploration-slot CTR read) | L–XL | The payoff of H0/H1 traffic |
| 2.4 | Weekly "new on your services" email digest (owned channel; future sponsorship inventory) | M | Retention independent of push opt-in |

**Stretch:** mood-rooms browse surface (v2.5 item; P3 evangelist fuel) · decide-together **fake-door test** — testing the web-first, guest-first "Tonight link" shape from H3 Bet 3, not an in-app two-phone feature · daily "Tonight's Pick" opt-in push (S — joins the notification suite; measures ritual potential for the H3 watchlist version) · smart mark-watched for series (whole-season sweep — the tracker-refugee need without becoming Trakt) · importers if not landed in H1 · "UK Streaming Taste Report" #1 if data volume supports it (PR/SEO + B2B seed) · affiliate tags live once programme thresholds clear.

**Exit gate:** W4 retention improved vs H1 baseline · rotation coach shipped and used (feature W4 ≥20% of actives) · Premium decision executed per its gate (launched, or explicitly deferred with reasoning) · ENG-2 shipped or re-gated · ops costs still side-project-sized.

### H3 — "Compound" (2027+) · the vision, rebuilt around four bets

*Independently reviewed 6 Jul (ideation pass + 2026 frontier research, both cited in Appendix A). Verdict on the previous H3 list: mostly scaling plans for decisions already made, not vision. Four strategic frames were missing; the two reviews converged on them independently. Everything remains sequenced by trigger, not date.*

**Bet 1 — Agents: the callable taste layer.** Within a couple of years most "what should I watch tonight?" utterances will go to ChatGPT/Gemini/Claude — and get taste-blind, availability-wrong answers. Videx exposes a consented, per-user connector (MCP server on the existing Worker — ChatGPT Apps and Claude connectors share the MCP substrate): any assistant answers from *your* taste graph, *your* services, with a working deep link. **Tubi shipped the first streamer ChatGPT app in April 2026 — single-catalogue only; the cross-service slot is empty.** This inverts our own risk table: "OS assistants own the utterance" becomes the distribution channel. This also reframes the v3 conversational-discovery bet: the "Videx 3.0" moment is **"Videx answers you anywhere"** — its own conversational surface *and* inside assistants; Graphiti+Kuzu becomes an implementation option evaluated at build time, not the headline. Trigger: capability, not scale — post-H2, once entitlements/auth plumbing exists. Build shape: S–M pilot (4–5 tools: recommend-tonight, where-to-watch, add-to-watchlist, worth-it-this-month). Gating fact to verify at trigger: ChatGPT Apps' UK availability (launch excluded UK/EEA); Claude connectors are UK-live today.

**Bet 2 — Money: subscription autopilot.** The rotation coach's endpoint: with explicit consent, build the user's optimal service calendar from their watchlist ("Netflix Jan–Mar for these 9 titles, pause, NOW in April"), fire the reminder with the exact cancellation page deep-linked before renewal, ping to resubscribe when the taste-fit backlog crosses a threshold. Headline: "same year of telly, £120 less" — the only feature in the category that pays for the subscription that unlocks it. **Regulatory tailwind is dated:** the UK DMCCA subscription regime (cancel-as-easy-as-signup, renewal reminders) lands spring 2027 — exactly as rotation coach v1 matures — and open-banking cVRP rails went live June 2026. Videx is the *intelligence layer* (a partnership hook for money apps and agents), never the cancellation plumbing. Trigger: rotation coach passes its H2 usage gate. Build: S–M for the scheduler + curated cancel/resume URL table; the fully agentic version waits for reliable consented execution rails.

**Bet 3 — Groups: "Tonight" links.** The UK's "what should *we* watch" is a WhatsApp-group problem. From any shortlist or row, generate a link: friends open it with **no app, no account**, see 5 taste-blended options, vote; the winner deep-links to playback. Every group decision recruits 2–4 non-users onto Videx title pages — the growth loop attached directly to the core job. First-party watch parties are dead (Prime, Disney+ both shut theirs); group *deciding* has only toy swipe-app competitors with no taste models. **This is the shape H2's decide-together fake-door should test** (web-first, guest-first — not an in-app two-phone feature). Household "whose night is it?" centroid switching folds in here (the K≤3 multi-interest centroids already model household members implicitly). Trigger: share infra live + engine pulse passed. Build: M — Worker routes + KV poll state; no accounts, no social graph stored.

**Bet 4 — Data sovereignty: the availability verification network.** Our #1 risk (rented availability data) inverted into the moat: every `deep_link_click` already carries URL + confidence + dwell — an *implicit verification* that an availability row is live; failed clicks and user reports catch rot; the sync pipeline is just the base layer. At scale Videx owns an **independently verified UK availability graph** — the OpenStreetMap of UK streaming — reducing SA API dependence, making "most accurate UK data" measurable, and providing the only honest foundation for the B2B path (which stays gated at ~100K MAU; without this, B2B means reselling someone else's licensed data). Starts now at zero cost — **H0's availability-report fix is the first brick** — and becomes a named programme at ~10K MAU when click volume gives statistical coverage per title×service pair.

**The flywheel — Videx Rewind.** Wrapped-style shareable taste artefacts with the blade nobody else can compute: **money** ("You paid £43/month; 71% of your watching happened on services costing £12"). Mood rooms write the copy ("You lived in *Slow-burn Scandi unease* this winter"); year-round identity cards (taste fingerprint, taste-compatibility %, "Watching Age") feed Bets 1–3. Benchmarks: Spotify Wrapped 2025 hit 200M users in 24 hours; Letterboxd rode shareable-stats culture from 17M to ~30M members in 18 months. H2's private stats feature is the seed; first public "your first 100 days" card mid-2027; full Rewind December 2027.

**Infrastructure & scale lines (kept — explicitly not the vision):** collaborative filtering at ~10K MAU · two-tower at ~50K MAU + 6 months data · web SEO expansion (title pages → browsable where-to-watch pages) · first expansion market at UK PMF (Ireland → AU/CA; US last) · B2B data pilots at ~50–100K MAU, gated on Bet 4.

**Watchlist (real, but wait for the named trigger):**
- *Taste-ranked trailer reel* — the cross-service Netflix-Clips move an aggregator can legally make (YouTube trailer embeds + the TMDb commercial agreement we need at monetisation anyway). Trigger: post-H2 engagement data.
- *Service-history importers* — Netflix's GDPR viewing-activity CSV + YouTube via its DMA-grade portability API, upgrading the H1/H2 tracker importers into a headline "bring your history" onboarding feature that kills cold-start. Trigger: dedup fix shipped (0.5) + importer infra.
- *Critic rooms (lean)* — 10 hand-picked UK critics' living rooms, availability-filtered per viewer, taste-ordered; concierge-curated at first, no marketplace. Trigger: shareable rooms + a few thousand MAU.
- *Critic-twin matching* — "your nearest critic is…" via one pgvector query over public critics' rating corpora. Trigger: rights-clean corpora (the real blocker) — also a Rewind card.
- *Daily "Tonight's Pick" push* — the basic opt-in version joins the H2 notification suite (S) and measures ritual potential; the bet-sized Wordle-like version only if open rates prove it.
- *Taste passport (open export format + import-from-anyone pledge)* — an S-sized trust/PR move executed opportunistically at the next tracker shutdown (there will be one).
- *Send-to-TV* — parked with a named tripwire: revisit when any UK top-5 service accepts an external deep link into its TV app, or iOS-27-style casting-openness reaches the UK. Until then: deep-link on phone + the service's own cast button is the flow. (2026 reality: cross-app casting is blocked; Matter Casting is Amazon-only and stalling.)

**Rejected at vision level (with reasons, so they stay rejected):** B2C2B white-label availability widgets (supplier licences prohibit redistribution; the taste moat doesn't transfer to logged-out viewers — only legitimate after Bet 4 at ~100K MAU) · kids/family as a standalone wedge (ICO Children's Code risk + solo capacity; "household/kids modes" stay as a feature, arthouse services stay as a catalogue question) · sports/live events layer (hourly-changing rights vs a daily-sync architecture, different persona, different company — hardened from "only with a partner" to a plain no) · Vision Pro/spatial (no market) · protocol-level casting (closed, fragmented).

### The not-now list (discipline)

- ❌ ENG-2 before its data gate (a model trained on 5 users is noise)
- ❌ Premium before its MAU gate — unless consciously run as a paid experiment (Decision 1)
- ❌ Paywalling arrival alerts or anything in the core loop
- ❌ Programmatic ads at any foreseeable scale (UK banner eCPMs ~$0.50–1.50 = noise revenue, real retention damage)
- ❌ Full episode-level tracking / Trakt parity (anti-persona; smart mark-watched only)
- ❌ Social network features (share sheet ≠ social; community is a Later bet)
- ❌ US expansion · TV apps (the phone is the wedge; TV OSes are the conflicted incumbents)
- ❌ Sports/live events layer (hourly-changing rights data vs a daily-sync architecture — a different company; hardened to a plain no at the 6 Jul vision review)
- ❌ White-label/API licensing (needs the Bet-4 data layer first)

---

## 7. The now-backlog (H0, in order)

1. **Book the solicitor** (this week; calendar-bound; everything else parallel). Their brief lands once item 2's data-model spec exists, so the single pass covers click-out logging + notification consent. Decide contact-address option.
2. **Notifications v1 spike** — data model (push tokens, consent) + one Edge trigger prototype reading `expires_on` (0.9). First fortnight: it feeds the solicitor brief.
3. **Fix onboarding funnel events** on native (0.2).
4. **Finish click-out telemetry** — persist link_type, add price_shown (0.3).
5. **Add sentry-expo** crash reporting (0.4).
6. **Taste-vector dedup fix** (0.5).
7. **Beta-blocking fixes**: password-reset E2E, editor_notes 040 apply-or-remove, availability-report E2E (0.8).
8. **Security/ops batch** (0.11): leaked-password toggle, IN-PX-29, IN-PX-30, backups, GitLab mirror, partman check, pricing refresh, IN-PX-50.
9. **Notifications v1 — delivery build** (0.9): EAS FCM/APNs credentials, Expo Notifications, Edge cron, arrival + leaving-soon alerts on real data.
10. **Share v1 + minimal title pages** (0.10): share sheet → Worker-served title landing with OG tags + store links.
11. **Friends-&-family shakeout** (~10–15 on existing internal tracks, testing alerts + share too; "active tester" definition applied) — no stranger recruiting yet (0.6).
12. **Store-release prerequisites**: verify Play production-access rules for the account (14-day/12-tester closed test if it's a personal account created after Nov 2023 — 0.6 doubles as it if needed); store-listing assets + copy + ASO keywords; pre-submission App Store guideline check (0.12).
13. **Quiet v1 release** on both stores once legal + shakeout clear — staged Play rollout, no announcements; release valve applies if notifications drag (0.12).
14. **Start the weekly ritual** (runs from week 1 alongside everything): triage + dashboard + 2h growth block (0.7).
15. Reserve remaining capacity for shakeout fixes.

Items 2–6 are individually small — realistic as the first fortnight alongside solicitor calendar time; the notifications delivery build (9) and share/title pages (10) are the meat of weeks 3–8.

---

## 8. Risks & open questions

| Risk | Severity | Mitigation |
|---|---|---|
| **Data supply**: SA API is the only indie-viable deep-link source; TMDb watch-providers is JustWatch-owned; monetising triggers TMDb commercial licence | High | Supabase cache + a *working* availability-report loop (fix the 0-rows problem in H0); budget the £1.5–2.5K/yr compliance floor into the Premium gate; Gracenote as scale-up path |
| **Engine quality unproven on strangers** | High | H0 exit gate now includes Tier-1 baselines + a disappointment-pulse, with a written pivot branch (cold-start iteration before launch) |
| **Solo capacity / burnout** | High | Committed-vs-stretch split; horizon gates are permission *not* to do things; weekly-hours reality check is Decision 3 |
| **No acquisition mechanism** (the old draft's blind spot) | High | Named growth workstream with weekly time-box from H0; per-channel measurement; paid-test decision escalated |
| **App Store review risk** (first public iOS review — now in H0; external rent/buy links; later an affiliate redirector) | Medium | Pre-submission guideline review; one rejection-cycle buffer in 0.12; affiliate-on-iOS check at H2 entry |
| **Public-before-polish** (quiet v1 means real users + permanent store ratings while the app is young) | Medium | Loops now ship inside v1 (0.9/0.10); shakeout (0.6/0.8) strictly before release; staged/percentage rollout on Play; no community pushes until crash-free ≥99%; review prompts held back until post-positive-signal |
| **H0 scope weight** (loops-in-v1 roughly doubles H0's build load at 6–16 hrs/wk) | Medium | Nothing else creeps into H0; the 0.12 release valve caps how long notifications can hold the release; stretch pool stays empty |
| **OS assistants** (Gemini on Google TV etc.) make "what to watch" an OS utterance | Medium | Own the cross-service personal taste graph the OS can't see; live on the phone |
| **JustWatch clones any single feature** (they shipped a TV Time migration tool in days) | Medium | Compound moat (UK data quality × taste model × trust), never a single feature |
| **Premium converts below benchmark** | Medium | Alerts-anchored paywall is the category's proven pattern; trial-first; costs stay side-project-sized either way; fake-door signals before build |
| **Taste-data pollution** (dedup gap, importers) | Medium | 0.5 fixes the paths before importers or scale |

**Decisions — RESOLVED by Joe, 6 July 2026** (the plan above reflects them):

1. **Premium trigger — MAU-gated at the 5–8K break-even band, confirmed.** No early paid experiment; Joe won't commit to that spend level speculatively. Wider framing: monetisation is a sustainability lever, not the goal — the product must add value, and the user/taste data asset matters more than early subscription revenue.
2. **Free/paid alert boundary — confirmed.** Nothing core is ever paywalled; a paid tier must be genuinely premium, spend-justifying additions. Arrival alerts stay free forever; leaving-soon/price-drop anchor Premium.
3. **Capacity & growth budget — set.** Half a day to a day at weekends + up to ~2 hrs/day weekdays when work allows (variable ~6–16 hrs/week). **No monthly ad spend until organic channels show early traction** — growth is free channels first: social-media content experiments + UK community posts (Reddit etc.).
4. **Rollout channels — public UK communities, against a live store listing.** Joe's call: TestFlight/closed-track invites are friction and can read as dodgy to strangers. So: quiet v1 store release first (H0 0.12), then community recruiting meets a real listing (H1 1.1). Friends & family only on internal tracks before that. **Extended 6 Jul: notifications v1 + share v1/title pages move INTO H0 so the v1 strangers meet already pings and shares** (H0 stretches to ~Jul–Sep accordingly; release valve in 0.12 protects the date).
5. **Episode tracking — "smart mark-watched only", confirmed.** Full tracking adds complexity and dilutes the app's purpose; the anti-persona holds. The TV Time refugee window has passed regardless. Optional soft play: a community post inviting opinions on episode tracking — listening, not building.

---

## 9. Metrics dashboard to stand up (H0)

- Activation funnel: install → signup → onboarding steps → first positive action (7d)
- WWD (north star) weekly + WWD per WAU; deep-link CTR by service
- W1/W4 cohort retention (seasonality-flagged)
- Tier 1: detail-view @10, watchlist conversion @10, deep-link CTR
- Feed health: per-row CTR/save-rate, exploration-slot CTR vs baseline
- Data quality: availability-report volume (currently 0 — fix the loop), sync failures, catalogue gaps
- Feature usage: alerts opt-in, rotation-coach engagement (instrumented with each feature at ship time — H2 gates read from here)
- Ops: crash-free rate (Sentry), For You p95, Worker/KV hit ratio
- Beta qualitative: disappointment pulse + top-3 complaint themes, refreshed weekly

---

## Appendix A — Key sources

**Market:** Barb Q4 2025 via Broadband TV News, 5 Feb 2026 (20.6m SVoD homes, 69.7%; ad-tier shares 87/38/35) · Barb Q1 2025 (14.1m multi-service homes) · Ofcom Media Nations 2025 · Kantar EoD Q1 2025 (bundles ~26%) · Gracenote/Nielsen State of Play, 5 Nov 2025 (66% single guide; 14-min decide; 19% abandon; 49% would cancel) · YouGov 20 Apr 2026 (32% cancel-to-switch; cost 70%) · Deloitte DCT UK 2023 (21% cancelled) · TiVo via The Streamable (~2021, 19% know what to watch).
**Competitors:** TechCrunch 2 Jul 2026 (TV Time shutdown 15 Jul, 26M installs) · JustWatch TV Time migration-tool launch page · Trakt forums 13 May 2025 (VIP $60, up-to-300%) · TechCrunch 3 Jun 2026 (Plex social, Match Score) · Plex blog (lifetime $749.99, 1 Jul 2026) · Semafor 26 Apr 2026 (Letterboxd sale, 26M+ users) · Everyone TV 15 Jan 2026 (Freely 1M weekly; TV-only) · Variety 15 Jun 2026 (Fox–Roku $22B) · MacRumors 14 Feb 2025 (Netflix pulls Apple TV integration) · blog.google Mar 2026 (Gemini on Google TV) · TechCrunch 30 Apr 2026 (Netflix Clips, US/UK first wave) · Letterboxd FAQ (Pro US$19.99/yr; can't do leaving-soon) · Callsheet pricing.
**Monetisation & platform:** Amazon Associates UK bounty/commission pages (+ Mobile Application Policy; 3-sales/180-days) · Disney+ Partner Program (Impact) · Paramount+ affiliate FAQ · Apple Performance Partners (7% rentals) · Awin (NOW/Sky) · RevenueCat State of Subscription Apps 2026 (median 2.0% D35; top quartile ~4.5–6% by category/geo) · Playwire/Business of Apps UK eCPMs · Android Developers Blog Jun 2026 (Play 10% + optional 5%; steering removed US/EEA/UK) · Apple Small Business Program (15%) · GOV.UK CMA steering consultations for Apple (closes 28 Jul 2026) and Google · TMDb API terms + commercial subscription (~$149/mo under $1M rev/2M users; JustWatch attribution; no deep links) · JustWatch "Audience as a Service" · Reelgood for Business.
**Vision review (6 Jul 2026):** OpenAI "Apps in ChatGPT" / Apps SDK (Oct 2025, MCP-based) · TechCrunch 8 Apr 2026 (Tubi first streamer ChatGPT app, single-catalogue) · Claude Connectors Directory (200+ incl. consumer wave, UK-live) · Taylor Wessing/Osborne Clarke (DMCCA subscription regime → spring 2027) · Open Banking Expo (cVRP scheme live 2 Jun 2026) · TechCrunch 4 Dec 2025 (Spotify Wrapped 2025: 200M users in 24h) · Deadline Jan 2025 + Letterboxd (17M → ~30M members) · watch-party shutdowns (Prime Watch Party, Disney+ GroupWatch) · Google Cast SDK docs (cross-app receiver launch blocked) · Matter Casting status 2026 (Amazon-only) · EC DMA developer portal (gatekeeper-only portability; streamers exempt) · Copyright Lately (SDNY embed ruling) · Ofcom Media Act implementation (PSB-only prominence).
**Internal:** videx-wiki registers (next-steps, pre-launch blockers, parking lot, deferred items, acceptance gates) · Supabase production queries, 5 Jul 2026 · codebase feature-surface + feasibility audits, 5 Jul 2026 · Videx Monetisation Strategy Exploration v0.1 (Apr 2026) · USP & Strategy Summary · Engine Strategy v1.8.

## Appendix B — Register cross-reference

| Register item | Roadmap slot |
|---|---|
| IN-XPS-014 solicitor review | H0 0.1 |
| IN-PX-29 / IN-PX-30 security · IN-XPS-004 (tracked-blocked on Supabase tooling) | H0 0.11 |
| IN-XPS-003 partman · IN-PX-50 backfill · backups · pricing refresh · GitLab mirror | H0 0.11 |
| Taste-summary quality review + genre taxonomy validation (blockers 19–20) | H0 beta feedback loop (0.7) |
| IN-PX-40 semantic fixture + IN-PX-41 flip mechanics | H1 1.5 |
| IN-PX-55 cluster rep curation | Joe-paced; feeds ENG-2 era |
| ENG-2 package (re-ranker, dashboards, recall@500, adaptive K) | H1 stretch (dashboard) → H2 2.3 |
| Mood-rooms browse surface (v2.5) | H2 stretch |
| Save-for-Later split (v2.5) | Backlog, on user pull |
| IN-PX-44/45 search-as-signal L2/L3 | Post-IN-PX-40, H2+/H3 |
| Taste dedup gap (memory: project_taste_dedup_gap) | H0 0.5 |
| v3 conversational discovery (Phase 7) | H3 Bet 1 "Videx answers you anywhere" — own surface + assistant connectors; Graphiti+Kuzu demoted to implementation option; gated on public-traffic Tier-1 baseline |
| CF ~10K MAU / two-tower ~50K MAU | H3, thresholds unchanged |
| Editorial data layer (040 + IN-V3-001) | 040 verified missing in prod → H0 0.8 apply-or-remove; editorial features backlog |

*Wiki hygiene note: the deferred-items register still lists "iOS launch" under v2.5 and a "stay Capacitor" discharged item — both stale post-NATIVE-4. Refresh alongside this roadmap's adoption.*
