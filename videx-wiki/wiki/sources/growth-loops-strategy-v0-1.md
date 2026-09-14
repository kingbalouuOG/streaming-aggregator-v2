---
title: Growth Loops Strategy v0.1 (14 September 2026)
type: source
tags: [strategy, growth, loops, sharing, households, seo, attribution, forward-planning]
created: 2026-09-14
updated: 2026-09-14
sources:
  - raw/forward-planning/Videx_Growth_Loops_Strategy_v0.1_2026-09.md
related:
  - wiki/concepts/forward-planning/growth-loops.md
  - wiki/sources/strategy-roadmap-2026-09-v1-1.md
  - wiki/concepts/architecture/notifications-v1.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/registers/next-steps.md
---

# Growth Loops Strategy v0.1 (14 September 2026)

**What it is.** A draft for review (owner: Joe for product, Claude for strategy) defining the growth loops Videx will pursue after v2, the foundations they share, a G0 to G5 build order, and per-loop measures. Source of truth: `docs/strategy/Videx_Growth_Loops_Strategy_v0.1.md`. Framing is Aakash Gupta's Input → Action → Output loop model, with one test for a loop worth building: the motivation behind the Action must be fundamental to the product, not manufactured by an incentive.

**Why it matters.** Roadmap v1.1 names "users are the critical path" and a growth workstream with no paid spend. This doc is the first design of how use of the product produces new users. It is the scope source for Phase G0 (foundations) and G1 (Loop 1 + Loop 5); plan at `docs/plans/2026-09-14-003-feat-phase-g0-g1-growth-foundations-and-sharing-plan.md`.

## Constraints it starts from (§2)

Solo part-time builder; lifestyle revenue goal so loops must compound from tens of users; the UK household is the target so "invite" means the person on the same sofa; referral incentives ruled out; daily UK catalogue freshness is the one asset bigger competitors lack.

## The five loops (§4)

| Loop | Input → Action → Output | Build needs | Measures |
|---|---|---|---|
| 1 Shareable objects (core viral) | Title or mood room worth telling someone → Share via WhatsApp/iMessage → rich preview with UK availability → open → install | Object URLs `/t/{slug}`, `/room/{id}`, `/list/{id}`; server-rendered OG per object in the Worker; app links + universal links with web fallback; native share sheet; copy carrying the availability line | Shares per WAU; preview open rate; open-to-install; install-to-first-share time |
| 2 Taste report card (Wrapped-style) | Onboarding done / rating threshold / monthly or December moment → shareable image card → "what's yours?" | Server-side image render (Worker + Satori) from `taste_profiles`; 3 to 5 variants; card URL on the Loop 1 stack; never judgemental | Generation rate; share rate per variant; installs by card URL |
| 3 Household (shared watchlists) | Decide what to watch together → link accounts, shared list, nudge | `households`, `household_members`, `watchlists` (list entity, distinct from per-user `watchlist`), `watchlist_items`, `watchlist_reactions`; reactions not comments; nudge push reusing Notifications v1 caps; "For both of you" row later | Households per 100 users; members per household; 30-day two-active-member share; adds per week; nudge-to-open |
| 4 Programmatic SEO | Daily sync writes arrivals/departures → Worker publishes indexable pages | Title pages (same `/t/` as Loop 1); "Leaving {service} this week" / "New on {service}"; public mood rooms; comparison pages; sitemap, canonical, schema.org; TMDb and SA API republishing terms to check | Indexed pages; organic sessions; organic-to-install; 20 tracked queries |
| 5 Notification-to-share | Arrival / leaving-soon push → deep link to title → "tell someone" at peak intent | Entirely Loop 1 plumbing | Share rate, notification-originated vs organic sessions |

## Shared foundations (§5)

1. Object URLs and routing. 2. Server-rendered previews in the Worker. 3. App links and universal links. 4. Apple and Google sign-in with a deferred deep link so an invitee lands on the shared object after sign-up. 5. Attribution: `?via=share|card|household|seo|push` on every shared URL, recorded on install and sign-up through the existing telemetry pipeline; no third-party analytics SDK.

## Sequencing (§6)

G0 foundations → G1 Loop 1 + Loop 5 → G2 Loop 3 household v1 → G3 Loop 2 cards → G4 Loop 4 SEO types 1 and 2 → G5 household-aware recommendations + SEO types 3 and 4. Household before cards is a judgement call: buzz without a retention mechanism produces installs that churn.

## Measurement (§7)

Weekly per loop: K-factor proxy (invites per active user × conversion; above 0.3 would be strong for a utility app); attributed installs by source; D7 and D30 retention by acquisition source and household membership.

## Open questions for Joe (§8) and what the codebase already answers

| # | Question | Status 2026-09-14 |
|---|---|---|
| 1 | Public domain and marketing page? | **Answered.** `videxstreaming.com` is live; apex is the marketing site on Vercel; the Worker holds path routes. G0 does not include standing one up. |
| 2 | Is the Expo app on iOS? | **Answered.** Yes: TestFlight since June, App Store submission 10 Sept, iOS-first decision. Universal links and Apple sign-in are in scope. |
| 3 | Household size and model | Open (G2). |
| 4 | Taste card tone | Open (G3). |
| 5 | Data licence check for SEO republishing | Open (G4). |
| 6 | December 2026 "Rewind" | Open. |

## Corrections to the doc's §3 audit (found 2026-09-14)

The audit table predates H0 Stream B and is stale on three rows. Recorded here until the doc is bumped (plan §9 D15):

| Row | Doc says | Actual |
|---|---|---|
| Share, invite, referral | None in the codebase | Share v1 shipped July 2026: `native/src/components/ShareButton.tsx` (RN `Share`), `share` event in `user_interactions` (migration 058). Invite and referral: none, correctly. |
| Routing | No router; titles have no URL | Titles have a public URL: `GET /t/{movie\|tv}/{tmdbId}` on the Worker. Mood rooms and watchlists: none, correctly. The web SPA has no router (PLAT-1 D5), but it is also not deployed anywhere. |
| Link previews | One static OG tag set | Per-title OG tags (poster, title, year, UK availability description) are server-rendered on `/t/`. The static set is only the undeployed Vite `index.html`. |

Still accurate: no app links or universal links; email and password only; Notifications v1 as described. Also note the shipped title URL is id-based, not `/t/{slug}`.

## Parking lot (§9)

Household recommendation blending; public profile pages (needs moderation); watch party (out, services own playback); referral incentives (ruled out).
