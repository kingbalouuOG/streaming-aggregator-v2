# Brief: Videx marketing site — videxstreaming.com

**Status:** ready to pick up · **Written:** 2026-07-12 (v2 — Payload + Next.js, separate repo)
**Effort:** ~2 days incl. CMS setup + DNS cutover · **Depends on:** nothing (store badge URLs arrive later)

> **This brief is standalone and destined for a NEW repository.** Copy it in as
> the founding doc (e.g. `BRIEF.md`) when the repo is created. It references the
> app repo (`streaming-aggregator-v2`) only for brand sources and the DNS
> cutover — no code is shared between the two.

## Context

Videx is a UK streaming guide (React Native app, quiet v1 store launch imminent).
The domain `videxstreaming.com` is live on Cloudflare and currently serves the
API Worker (`workers/api` in the app repo): `/v1/*` (the app's API), `/t/*`
(title share pages), `/reset` (password-reset bridge), `/privacy` + `/terms`
(store-required legal pages). **The root `/` has no page.** Two forces want one:

1. **Store requirement:** Apple reviewers open the listing's Support URL, and
   Play shows the website publicly. Both point at the domain root.
2. **Marketing:** anywhere the domain gets mentioned, the landing needs to
   explain the product and route people to the stores — and Joe needs to tweak
   copy, taglines and links himself without a code deploy.

Requirement 2 is why this is a CMS-backed site, not a static page: marketing
copy is expected to be iterated on, and editing it should be a browser task.

## The ask

A marketing site in its **own repository**, completely separate from the app:

- **Next.js** (App Router, current stable major) — statically rendered pages,
  revalidated on CMS publish. Fast is a feature: this page should score ~100
  on Lighthouse; it's one page of prose, images and two badges.
- **Payload CMS v3** — runs *inside* the Next.js app (its native v3 mode), so
  there is one deployable, one repo, one host. Admin UI at `/admin`.
- **Hosting: Vercel** (hobby tier is fine at this traffic). One project, root
  of the new repo.
- **Database: Supabase Postgres** — the existing Videx project
  (`fmusugdcnnwiuzkbjquo`), in a **dedicated `payload` schema** (Payload's
  `schemaName` option) so CMS tables never mingle with app tables. Use the
  **session pooler** connection string (the direct URI is IPv6-only and fails
  from most CI/build environments — hard-won app-repo lesson). Payload manages
  its own auth/tables; do NOT enable RLS on the payload schema.
- **Media**: the only images v1 needs are the logo and OG image — commit them
  to the repo as static assets. Skip upload-storage adapters until the site
  actually needs editorial imagery.
- Scope: **one landing page** + whatever tiny pages fall out for free
  (a /press or /contact can wait). Legal pages STAY on the Worker — they are
  store-declared URLs and single-sourced from the app repo's markdown.

### Why one page on a CMS isn't overkill (decision record)

A fair challenge — the answer: the copy is the product here, Joe will iterate
on taglines/USP wording repeatedly, and each iteration should be
edit-in-browser → publish, not PR → deploy. Payload-inside-Next adds no second
service and no extra host. If it ever feels heavy, the content model below is
small enough to flatten back into code in an hour.

## Content model (Payload)

One **global** (`landing`) rather than collections — this is a singleton page:

| Field | Type | Notes |
|---|---|---|
| `tagline` | text | The headline. Seed from the shortlist below. |
| `subhead` | text | One supporting sentence. |
| `emailBody` | richText | The marketing-email-style body (the four USPs as flowing prose). |
| `uspCards` | array (4) of {title, body} | Optional structured alternative if design wants cards — keep both, render whichever the layout uses. |
| `appStoreUrl`, `playStoreUrl` | text, optional | Empty = render badges in "coming soon" state. **This is the one-line swap for launch day, now a CMS edit.** |
| `founderNote` | richText, optional | Short trust element (see content direction). |
| `seo` | group: title, description, ogImage ref | |
| `footerLinks` | fixed in code | /privacy, /terms, privacy@ — these are store-declared, don't make them editable. |

Enable **drafts + versions** on the global (free undo for copy experiments)
and Next.js **on-demand revalidation** on publish.

## Copy direction (unchanged — the important part)

**Voice: a marketing email to a customer.** Write as if Videx is emailing
someone who half-heard about the app from a friend — warm, direct, second
person, plain UK English. NOT a SaaS landing page, NOT a feature grid with
icon cards, NOT growth-hacker punchy.

Hard rules from Joe:
- **Not too wordy, not too punchy.** Complete sentences at a relaxed pace.
  Roughly 150–250 words of body copy total. No exclamation marks.
- **Must not read AI-written.** Ban the tells: "seamless", "effortless",
  "elevate", "unlock", "supercharge", "say goodbye to…", "in today's world",
  rhetorical-question openers, rule-of-three adjective stacks. If a sentence
  could appear on any startup's page, rewrite it until it could only be about
  Videx.
- **Never say "AI" in consumer copy.** The product language is "taste
  profile" / "learns what you love" — concrete and human, not model-talk.
- Independence disclaimer (not affiliated with any streaming service) in the
  footer.

**The four USPs, in this order:**

1. **All your services, one app.** Netflix, BBC iPlayer, Prime Video, Disney+,
   Apple TV+, NOW, Paramount+, ITVX, Channel 4 — one guide instead of five
   apps' worth of scrolling.
2. **Genuinely personal.** Videx builds a taste profile from what you tell it
   and what you watch, and recommends across everything you can access — not a
   generic top ten.
3. **Know where everything is.** Every title shows exactly which of your
   services has it — included, free, or to rent/buy with UK prices — and one
   tap opens it in the right app.
4. **Built around the services you actually pay for.** You pick your
   platforms; Videx tracks what's new, what's arriving and what's leaving on
   *your* set — so your subscriptions earn their keep.

## Content inspiration (strategy steer — Joe reviews, none of this is final)

### Tagline shortlist

Grouped by angle. The strongest options say the *outcome* in Videx's plain
voice; the weakest sell the *mechanism*.

**The consolidation angle (USP 1 — the clearest single thought):**
- *Every service. One guide.* — bluntest, most ownable; pairs well with a
  service-logo strip under it.
- *All your streaming, sorted.* — warm, British, slightly informal.
- *One app for all of it.* — conversational; works as a spoken sentence.

**The decision angle (the actual job-to-be-done — deciding tonight):**
- *Know what to watch, and where.* — quietly does USPs 2 and 3 in seven words;
  my (strategy) favourite as the headline, with a consolidation line as the
  subhead.
- *What to watch tonight, across everything you pay for.* — longer; strong as
  a subhead under a short headline.
- *Your next watch, found.* — compact; slightly ad-agency, use with care.

**The value angle (subscriptions earning their keep — differentiating, more H2):**
- *Make your subscriptions earn their keep.* — great line, but leads with
  money rather than joy; better as a section header than the hero.

**Flag-and-avoid:** *Stop scrolling. Start watching.* tests well in ad copy
but is exactly the "too punchy" register Joe ruled out — noted here so nobody
reinvents it.

**Recommended pairing to seed the CMS:**
> **Know what to watch, and where.**
> Videx brings every UK streaming service into one guide, learns your taste,
> and shows you where everything streams — included, free, or to rent.

### Body copy

The app repo's Store Submission Pack has an approved ~1,600-char description
in exactly the right voice — reuse it as the base, trimmed to ~200 words for
the page. Don't rewrite what's already approved.

### Founder note (optional but recommended)

Videx has no user counts or press to show yet; the honest trust element for an
indie product is the maker. Three sentences, first person, e.g.: built by one
person in the UK who was tired of scrolling five apps every evening; no ads,
no selling your data; email me at privacy@videxstreaming.com. Skippable if it
feels exposed — but it's the kind of thing early users screenshot and share.

### CTA microcopy

"Get Videx free" on the badges' section header. Pre-launch (badges disabled):
"Coming to the App Store and Google Play" — never a fake email-capture form;
we're not running a waitlist.

## Branding sources (in order of authority)

1. **Design handoff package** (app repo / design docs) — the `--vx-*` tokens
   and production logo. Core palette: background `#0a0a0f`, card `#14141c`,
   primary orange `#e85d25`, cream text `#f2ead9`, soft cream
   `rgba(245,241,232,0.72)`.
2. **Live precedents** — `workers/api/src/titlePage.ts` and `resetBridge.ts`
   in the app repo implement the dark editorial style; match their feel.
3. **Fonts:** the brand is **Fraunces** (display serif) + **DM Sans** — a real
   frontend can finally use them properly: self-host via `next/font` (no
   runtime Google requests). The app's Fraunces optical cuts live in
   `native/assets/fonts/` if exact parity is wanted.
4. Do NOT use `C:\Users\User\Pictures\Videx` screenshots as reference — stale.
5. Store badges: official Apple/Google badge artwork, per their usage
   guidelines (no recolouring, keep clear space).

## DNS / routing cutover (⚠️ the delicate bit — app API must not break)

Today `videxstreaming.com` is attached to the **videx-api Worker as a custom
domain**, so the Worker owns every path. The shipped app (v2.1.x) calls
`https://videxstreaming.com/v1/*`; reset emails, share links and the store
forms use the other paths. The cutover converts this to **path-scoped Worker
routes** + Vercel at the origin. Cloudflare evaluates Worker routes before the
origin, so API traffic never reaches Vercel. **No app build, no app-code
change.**

Complete live route inventory (verified against `workers/api/src/index.ts`
2026-07-12 — re-verify on cutover day):

```
videxstreaming.com/v1/*        (health, title, foryou, tmdb proxy)
videxstreaming.com/t/*         (share pages)
videxstreaming.com/reset*      (password-reset bridge)
videxstreaming.com/privacy*    (legal — store-declared URL)
videxstreaming.com/terms*      (legal — store-declared URL)
```

Cutover sequence (do it in this order; each step is reversible):

1. Deploy the marketing site on Vercel at its `*.vercel.app` URL first; get it
   approved there.
2. In the app repo, add the five route patterns to `workers/api/wrangler.toml`
   (`routes = [{ pattern = ..., zone_name = "videxstreaming.com" }]`) and
   merge → CI deploys the Worker with routes registered. (Routes are inert
   while the custom domain still owns the hostname.)
3. In the Cloudflare dashboard: remove the Worker **custom domain** attachment
   for `videxstreaming.com` (Workers → videx-api → Domains & Routes). The
   route patterns from step 2 immediately take over the API paths.
4. Add the DNS record for the apex → Vercel (CNAME/A per Vercel's dashboard
   instructions), **proxied** (orange cloud), and set SSL mode **Full
   (strict)** for the zone if it isn't already — anything less loops redirects
   with Vercel. Add the domain to the Vercel project.
5. Verify, in this order (all must pass before walking away):
   ```
   curl -s https://videxstreaming.com/v1/health          → Worker JSON
   curl -s -o /dev/null -w "%{http_code}" https://videxstreaming.com/reset?token_hash=test123&type=recovery  → 200
   curl -s https://videxstreaming.com/privacy | head     → policy HTML
   curl -s https://videxstreaming.com/t/movie/603        → share page HTML
   curl -s https://videxstreaming.com/                   → marketing HTML (Vercel)
   ```
   Then open the app and confirm For You loads (the real /v1 consumer).
6. **Rollback** at any failure: re-attach the custom domain in the Workers
   dashboard (instant, takes the whole hostname back) and remove the Vercel
   DNS record. The old `*.workers.dev` URL also remains live as a safety net.

Standing rule going forward, documented in the app repo's worker README: **any
new public Worker path needs a route entry added** — the custom domain's
catch-all is gone.

## Ops & secrets

- Vercel env: `DATABASE_URI` (Supabase **session pooler**, dedicated
  `payload` schema user or the postgres user), `PAYLOAD_SECRET` (generate,
  password-manager it), `NEXT_PUBLIC_SITE_URL=https://videxstreaming.com`.
- Payload admin: single admin user (Joe) with a strong password; admin UI is
  at `/admin` — check it's excluded from indexing (Payload sets this, verify).
- No analytics in v1 (no consent banner needed, keeps the page clean and the
  privacy policy honest). Vercel's server-side request counts are enough.

## Acceptance criteria

- [ ] New repo, Next.js + Payload v3, deploys on Vercel from `main`
- [ ] Landing global in Payload; editing the tagline and publishing updates
      the live page without a deploy (revalidation works)
- [ ] Copy covers the four USPs in the email voice; passes the "could this
      sentence be about any app?" test; no banned phrases; no "AI"
- [ ] Store badges official artwork; "coming soon" until URLs set in CMS
- [ ] Brand-faithful: palette tokens + Fraunces/DM Sans via next/font
- [ ] Lighthouse ≥95 performance/SEO on the landing page; proper title, meta
      description, canonical `https://videxstreaming.com/`, OG/Twitter tags
- [ ] Footer: /privacy, /terms, privacy@videxstreaming.com, independence
      disclaimer, © 2026 Videx
- [ ] DNS cutover completed per the runbook, ALL verification curls pass,
      and the app's For You confirmed working post-cutover
- [ ] App repo updated: worker README notes the routes rule; store submission
      pack's "gap #1 landing page" marked resolved

## Phasing note (timing escape hatch)

If Apple review timing lands before this site is ready: the app repo has an
older fallback (a static Worker-rendered landing at `GET /` — ~30 minutes of
work, previous version of this brief) that satisfies the Support URL
requirement and is deleted at cutover. Don't build both by default; use the
fallback only if the store timeline forces it.
