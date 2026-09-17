# Videx Growth Loops Strategy v0.2

**Status:** Approved by Joe, 17 September 2026 (supersedes v0.1). Wiki snapshot: `videx-wiki/raw/forward-planning/Videx_Growth_Loops_Strategy_v0.2_2026-09.md`
**Owner:** Joe (product), Claude (strategy)
**Date:** 17 September 2026 (v0.1: 14 September 2026)
**Related:** Orchestration v0.3.3, Strategy v1.6.3, Monetisation Strategy Exploration v0.1, Notifications v1 (H0 Stream B)

**Changes from v0.1:** §3 corrected against the codebase as it stood on 14 September (v0.1 undercounted what existed) and extended with the state after G0 and G1 shipped and were verified on device (17 September). §8 questions 1 and 2 answered. §4 Loop 1 item 1 states the shipped URL grammar; §6 records the release-together decision. Sections 5, 7 and 9 are unchanged.

---

## 1. Purpose

Videx v2 is built. The next problem is distribution: getting UK households to install it, and designing the product so that use of it produces new users. This document defines the growth loops Videx will pursue, the foundations they share, the order in which to build them, and how each will be measured.

Framing borrowed from Aakash Gupta's growth loops model: every loop is Input → Action → Output, where the output feeds the next input. The test for a loop worth building is whether the motivation behind the Action is fundamental to the product rather than manufactured by an incentive.

## 2. Constraints that shape the strategy

- Solo builder, part-time. Loops must be cheap to build and cheap to run.
- Lifestyle revenue goal, so loops need to compound from tens of users, with no paid acquisition assumed.
- Target user is the UK household, which changes what "invite" means: the highest-value invitation is to the person on the same sofa.
- Referral incentives are ruled out. There is no currency to give and paid-for invitations decay.
- UK catalogue freshness (daily sync, arrivals and departures per service) is the one asset competitors with bigger budgets lack at this granularity.

## 3. Current state audit

### 3a. Before G0 (14 September 2026, corrected)

v0.1 said "zero loop plumbing". The codebase already had a first share path and a public title page:

| Area | State on 14 September |
|---|---|
| Share | Share v1 from H0 Stream B (July 2026): a share button on the native detail page using the system share sheet, sharing a Worker title URL and logging `share` to `user_interactions`. No room share, no share copy beyond the title, no share events. |
| Routing | Native app: Expo Router file routes with a system-link interceptor (`+native-intent`) and the `videx://` scheme. Web SPA: no router, and not a distribution surface. Titles had a Worker URL (`/t/{type}/{tmdbId}`); rooms and watchlists had none, and mood room ids were not stable across the monthly recluster. |
| Link previews | Per-title Open Graph and Twitter tags on the Worker title page (poster, UK "Stream now" and "Rent or buy" lists). The marketing site kept its single static tag set. |
| App links / universal links | None; no `.well-known` files. |
| Auth | Email and password only; `profiles.username` required at sign-up, so provider sign-in needed a migration. |
| Web presence | `videxstreaming.com` marketing site (separate repo, Vercel) with Cloudflare dashboard routes sending `/v1/*`, `/t/*`, `/reset*`, `/privacy*`, `/terms*` to the `videx-api` Worker. |
| Deferred deep link | None: a signed-out tap lost its target at sign-in. |
| Attribution | None: no install id, first open, referrer capture or `via`. |
| Retention loop | Push notifications v1: watchlist arrivals and leaving-soon, one bundled push per user per day, Expo push (APNs and FCM); payload carried no delivery id and taps logged nothing. |
| iOS | Live on TestFlight; App Store submission made 10 September; iOS-first release. |
| Assets reusable for loops | Taste profile (`taste_profiles`), watchlist (`watchlist`, per user), anchored mood rooms, spend dashboard, calendar, daily availability sync. |

Summary: strong loop raw material, a first share path and title page, and none of the foundations (verified links, provider sign-in, deferred deep link, attribution).

### 3b. After G0 and G1 (17 September 2026)

| Area | State |
|---|---|
| Object URLs | `/t/{type}/{tmdbId}-{slug}` (slug cosmetic, 301 to canonical), `/room/{id}` for frozen room snapshots, `/list/{id}` reserved for G2 (ADR-015). |
| Previews | Worker title and room pages with OG tags, the UK availability line, the iOS smart banner and both store buttons (App Store listing live). |
| App links / universal links | Verified on iPhone and Android, cold and warm, from WhatsApp, Messages and Slack. Android `assetlinks.json` lists both the upload key and Google's Play App Signing key. |
| Sign-in | Apple (iOS) and Google on both platforms, email with confirmation (switched on permanently when 2.5.0 is public), placeholder usernames with "Choose your name". |
| Deferred deep link | In-app pending link through sign-in and onboarding; on Android the Play Install Referrer carries the shared object into a fresh install (verified). No probabilistic iOS matching. |
| Attribution | `growth_events` (Worker-written): preview fetched vs opened, link opened, first open, sign-up completed, share initiated and completed, notification opened; `via` and `src` on every row; `growth-dashboard.sql` for the section 4 and 7 measures. |
| Loop 1 | Share titles and rooms with UK availability copy. |
| Loop 5 | Push payloads carry a delivery id; a push-opened session shows "Tell someone" and shares carry `src=push`. |
| Open | Notification permission asked only at the first watchlist add (moving to after onboarding); no real cohort yet, so no loop numbers. |

## 4. The loops

### Loop 1: Shareable recommendation objects (core viral loop)

Input: a user finds a title or a mood room worth telling someone about.
Action: taps Share; sends a link via WhatsApp, iMessage or similar.
Output: recipient sees a rich preview (title, poster, "on Netflix and Now in the UK"), opens it, installs.

Why fundamental: "what should we watch" is already a conversation UK households have daily. Videx adds the one thing a bare title name lacks, which is where it is available right now.

Build requirements:
1. URL routing: `/t/{type}/{tmdbId}-{slug}` for titles (resolved by id, slug cosmetic), `/room/{id}` for room snapshots frozen at share time, `/list/{id}` for watchlists (reserved; needed by Loop 3). Recorded in ADR-015.
2. Server-rendered OG tags per object via the Cloudflare Worker (poster, availability, one-line hook). Crawlers from WhatsApp, iMessage and Slack read these without executing JavaScript, so this must be server-side.
3. App links (Android) and universal links (iOS) so an installed app opens the object directly; the web fallback shows the preview and an install prompt.
4. Share affordance on the detail page and mood room header. Use the native share sheet; avoid building a custom one.
5. Share copy that carries the UK availability line, since that is the hook.

Measures: shares per weekly active user; preview open rate; open-to-install rate; time from install to first share. If open-to-install stays under a few percent, the landing preview is the problem, not the loop.

### Loop 2: Taste report as social artefact (Wrapped-style)

Input: user completes onboarding, or reaches a rating threshold, or a scheduled moment arrives (monthly, or an annual "Videx Rewind" in December).
Action: receives a designed, shareable card ("Your taste: slow-burn thriller, 61% British, most-used service NOW") and posts it or sends it to friends.
Output: the card carries the brand and a comparison hook ("what's yours?") into feeds and group chats; recipients install to get their own.

Honest caveat: Spotify Wrapped works because of scale and because the data is deeply personal listening history. Videx has neither at launch. The version that can work early is comparison rather than broadcast: two people in a chat comparing taste cards. Design for pairwise sharing first, broadcast second.

Build requirements:
1. Taste card generator: a server-side image render (Worker + Satori or similar) from `taste_profiles`, so the card is a real image that survives every messaging app.
2. Three to five card variants to test: taste genome, "your streaming year", service value (ties to the spend dashboard: "you paid £X for Y hours of things you rated up"), compatibility with a named friend (needs Loop 3).
3. A card URL that lands on the same web preview stack as Loop 1.
4. Content guardrails: cards must be flattering or funny, never judgemental. Nobody shares a card that says they watch too much reality TV.

Measures: card generation rate; share rate per card variant; installs attributed to card URLs. Treat this as an experiment: build the pipeline once, iterate on variants monthly.

### Loop 3: Household loop (shared watchlists)

Input: a user wants to decide what to watch with a partner, flatmate or family member.
Action: links accounts into a household; saves titles to a shared watchlist; nudges the other person ("I've added three things, what do you think?").
Output: a second (and third) account per household, each with a standing reason to return, each a potential sharer for Loops 1 and 2.

Why fundamental: this matches the product thesis directly. The household already shares the subscriptions; it should share the queue. Early research conversations point to the same need.

Product shape (v1, deliberately small):
1. Household entity: one owner, up to N members, joined by link or code. Invitation link is a Loop 1 URL, so the invitee lands on a preview of the shared list before signing up.
2. Shared watchlist alongside personal watchlists. Membership is per list, so a couple's list and a flat's list can coexist.
3. Reactions on shared items (thumbs up, thumbs down, "tonight?") rather than comments. Comments invite moderation problems and empty states.
4. Nudge notification: "Joe added 3 titles to Sofa list" and a daily bundled digest, reusing the Notifications v1 dedup and cap rules.
5. Household-aware recommendations: a "For both of you" row blending member taste profiles. This is the differentiated bit, and it depends on the recommendation engine, so it is phase two of the loop, after the shared list itself ships.

Schema implications (to escalate before build): `households`, `household_members`, `watchlists` (list entity separate from the current per-user `watchlist` table), `watchlist_items`, `watchlist_reactions`. The existing `watchlist` table would migrate to a default personal list per user.

Measures: households created per 100 users; members per household; percentage of households with two or more active members after 30 days; shared-list adds per week; nudge-to-open rate.

### Loop 4: Programmatic SEO loop from the catalogue

Input: the daily sync writes arrivals, departures and expiries per UK service.
Action: the Worker publishes public, indexable pages built from that data.
Output: search traffic ("leaving Netflix UK September", "is Severance on Now", "best thrillers on iPlayer") lands on pages with an install prompt and, for signed-in users, a one-tap add to watchlist.

Why fundamental: the data updates itself. The content marginal cost is zero once templates exist, and freshness is what ranks for these queries.

Page types, in order of value:
1. Title pages: `/t/{slug}`, the same URL as Loop 1, with availability, ratings, similar titles. This makes Loops 1 and 4 share one surface.
2. "Leaving {service} this week" and "New on {service}" pages, regenerated daily.
3. Mood room pages from the global HDBSCAN clusters (the v2.5 browse surface, made public).
4. Comparison pages: "{title}: which UK service" and "{service A} vs {service B} for {genre}".

Build requirements: server rendering or static generation in the Worker; sitemap; canonical tags; structured data (Movie / TVSeries schema.org); a real domain with a marketing home page. Expect three to six months before this compounds.

Measures: indexed pages; organic sessions; organic-to-install rate; ranking positions for a tracked set of twenty queries.

Risk to flag: TMDb and Streaming Availability API terms on republishing data at scale. Check before building page type 1 beyond the app's own detail view.

### Loop 5: Notification-to-share loop

Input: an arrival or leaving-soon push fires for a watchlist title.
Action: the notification deep-links to the title; the detail page surfaces "tell someone" at that moment.
Output: shares at peak intent, feeding Loop 1.

Smallest loop on the list. Depends entirely on Loop 1 plumbing. Once household lists exist, the same push can read "Severance just arrived on Apple TV+ and it's on your Sofa list" and go to every member.

Measures: share rate from notification-originated sessions versus organic sessions.

## 5. Shared foundations (build once)

1. Object URLs and routing (Loops 1, 2, 3, 4, 5).
2. Server-rendered previews in the Cloudflare Worker (Loops 1, 2, 4).
3. App links and universal links (Loops 1, 3, 5).
4. Frictionless sign-up: Apple and Google sign-in, with a deferred deep-link so the invitee lands on the object they were sent after sign-up. Every loop leaks at this step today.
5. Attribution: every shared URL carries a source parameter (`?via=share|card|household|seo|push`) and the install and sign-up events record it. Without this the metrics in section 4 cannot be measured.

## 6. Sequencing

| Phase | Scope | Rationale |
|---|---|---|
| G0 | Foundations 1 to 5 above | Unblocks everything; nothing else is measurable without it |
| G1 | Loop 1 (share titles and rooms) and Loop 5 | Cheapest complete loop; validates preview-to-install rate |
| G2 | Loop 3 household v1 (shared list, invite link, reactions, nudges) | Highest strategic fit; most demand from research conversations |
| G3 | Loop 2 taste card pipeline plus first three variants | Needs Loop 1 landing stack and, for the compatibility card, Loop 3 |
| G4 | Loop 4 SEO page types 1 and 2 | Long lead time; start once title pages exist from G0 |
| G5 | Household-aware recommendations; SEO page types 3 and 4 | Depends on G2 and G4 respectively |

Release decision (Joe, 14 September): the loops go live together, not phase by phase, so G0 to G2 build in sequence with no public release between them. G1's "validates preview-to-install rate" is therefore a measurement after launch rather than a gate on G2, and per-loop measures will be confounded at launch; accepted.

The order G2 before G3 is a judgement call. The counter-argument is that a taste card is cheaper and could produce buzz sooner. The reason to prefer household first: buzz without a retention mechanism produces installs that churn, and the household loop is the retention mechanism.

## 7. Measurement

Track per loop, weekly, from launch:

- K-factor proxy: invitations sent per active user × invitation conversion rate. Aim for a measurable number, then improve it; a value above 0.3 would be strong for a utility app.
- Attributed installs by source parameter.
- Retention at D7 and D30 split by acquisition source and by household membership (yes or no). The household hypothesis is that members retain materially better than solo users; if they do, the loop justifies further investment.

Instrumentation should reuse the existing impressions and telemetry pipeline rather than adding a third-party analytics SDK.

## 8. Open questions for Joe

1. ~~Domain and web presence: is there a public domain and a marketing page today, or does G0 include standing one up?~~ **Answered:** yes. `videxstreaming.com` is the marketing site (separate Next.js repo on Vercel), and the `videx-api` Cloudflare Worker serves the object pages, `.well-known` files and API behind dashboard routes on the same domain. G0 added routes, not a new site. A `/` page on the Worker stays out of scope; SEO page types (Loop 4) will need their own routes.
2. ~~iOS status: is the Expo app shipping on iOS as well as Android? Universal links and Apple sign-in are moot until it is.~~ **Answered:** yes, and iOS leads. 2.4.0 is live on the App Store (listing `id6785395342`); 2.5.0 carries G0/G1 and has been verified on device. Android is on Play internal testing and reaches production after the closed-test gate (12 testers, 14 days). Universal links and Apple sign-in shipped in G0.
3. Household size and model: couples only in v1, or families and flats from the start? Owner-and-members, or flat membership?
4. Taste card tone and brand: how far towards playful can the cards go relative to the current dark, neon-green design system?
5. Data licence check on SEO republishing (section 4, Loop 4 risk). Who confirms TMDb and SA API terms?
6. Should the annual "Rewind" moment be planned for December 2026, given that requires enough watch and rating history per user to be interesting?

## 9. Parking lot

- Household-aware recommendation blending strategy (average of taste vectors versus intersection of high-affinity regions) to be specced with the engine, once G2 telemetry exists.
- Public profile pages (a user's curated lists as SEO and social surfaces). Deferred: needs moderation and privacy controls.
- Watch party or synchronised viewing. Out of scope; the streaming services own playback.
- Referral incentives: ruled out (section 2).
