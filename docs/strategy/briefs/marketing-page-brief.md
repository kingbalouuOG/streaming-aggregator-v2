# Brief: Marketing page at videxstreaming.com

**Status:** ready to pick up · **Owner:** any session (self-contained) · **Written:** 2026-07-12
**Effort:** half a day incl. review · **Depends on:** nothing (store badge URLs arrive later)

## Context

Videx is a UK streaming guide (React Native app, quiet v1 store launch imminent).
The domain `videxstreaming.com` is live on Cloudflare and currently serves only the
API Worker (`workers/api`) — hosted legal pages (`/privacy`, `/terms`), title share
pages (`/t/:id`), and the password-reset bridge (`/reset`). **The root `/` has no
page.** Two forces want one:

1. **Store requirement:** Apple reviewers open the listing's Support URL, and Play
   shows the website publicly. Both point at the domain root.
2. **Marketing:** anywhere the domain gets mentioned (word of mouth, socials,
   email footers), the landing needs to explain the product and route people to
   the stores.

This is NOT a growth surface for H0 — nobody is being driven here yet. It's a
"just in case people arrive" page that must be accurate, on-brand, and reusable
as the canonical marketing blurb.

## The ask

One page, served at `GET /` on the videx-api Worker. No CMS, no build step, no
JS framework — a rendered HTML string in the Worker, same pattern as the
existing pages.

## Copy direction (the important part)

**Voice: a marketing email to a customer.** Write it as if Videx is emailing
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
- Independent tone note: Videx is not affiliated with any streaming service —
  keep the one-line disclaimer (footer is fine).

**The four USPs to build the copy around, in this order:**

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

Structure suggestion (adapt, don't worship): logo/wordmark → one headline that
carries USP 1 → short email-style body working through 2–4 as flowing prose or
minimal list → store badges → footer (privacy · terms · contact ·
independence disclaimer · © 2026 Videx). One screen-and-a-bit on mobile.

**Store badges:** use the official "Download on the App Store" and "Get it on
Google Play" badge artwork (inline as SVG/data-URI — no external asset hosts).
Store URLs don't exist yet: ship the badges in a visually-dimmed "coming soon"
state with no href, structured so dropping the real URLs in later is a
one-line change each. Follow each store's badge usage guidelines (no
recolouring, keep clear space).

## Branding sources (in order of authority)

1. **Design handoff package** — the `--vx-*` tokens and production logo
   (see memory/wiki: reference_videx_design_handoff). Core palette:
   background `#0a0a0f`, card `#14141c`, primary orange `#e85d25`, cream text
   `#f2ead9`, soft cream `rgba(245,241,232,0.72)`.
2. **Live precedents in this repo** — `workers/api/src/titlePage.ts` (title
   share pages) and `workers/api/src/resetBridge.ts` (reset bridge) already
   implement the dark editorial style on the Worker; match them.
3. **Fonts:** the brand is Fraunces (display serif) + DM Sans. On the Worker
   pages, `titlePage.ts` shows the accepted approach — follow whatever it does
   (system serif stack or hosted font); do not introduce a new font pipeline
   for this page.
4. Do NOT use `C:\Users\User\Pictures\Videx` screenshots as reference — stale
   (standing note from Joe, 2026-06-15).

## Technical implementation

- **Where:** `workers/api/src/` — new module `landingPage.ts` exporting a
  render function (pure, no Workers imports — testable under the root vitest
  rig like `resetBridge.ts`), wired to `GET /` in `index.ts`.
- **Check first:** what `GET /` currently returns (likely Hono 404 or a JSON
  health response). If a health/root API response exists, move it to `/health`
  or similar and check nothing calls `/` (grep the native app + scripts).
- **Headers/SEO:** this page SHOULD be indexed (unlike /reset): proper
  `<title>` ("Videx — every UK streaming service in one guide" or similar),
  meta description, canonical `https://videxstreaming.com/`, Open Graph +
  Twitter card tags (og:image can reuse the production logo), favicon
  (`titlePage.ts` shows how assets are inlined). Cache-Control: public,
  long max-age is fine — the page is static.
- **Responsive:** mobile-first; most arrivals will be on phones.
- **Accessibility:** real heading order, alt text on badges/logo, AA contrast
  (the cream-on-dark palette passes; check the orange on dark for small text).
- **Tests:** unit tests alongside (`__tests__/landingPage.test.ts`) — renders,
  contains the four USP anchors, badges present but hrefless, noindex NOT set.
- **Deploy:** merging to main auto-deploys the Worker (`deploy-worker.yml`
  triggers on `workers/api/**`). Verify live with curl after merge.

## Acceptance criteria

- [ ] `https://videxstreaming.com/` serves the page (200, HTML, indexed-able)
- [ ] Copy covers all four USPs in the email-like voice; passes the "could this
      sentence be about any app?" test; ≤ ~250 words body; no banned phrases
- [ ] Brand-faithful: palette/type match titlePage.ts precedent; logo used
- [ ] Store badges present, official artwork, coming-soon state, one-line swap
- [ ] Footer links to /privacy, /terms, privacy@videxstreaming.com, disclaimer
- [ ] Renders correctly at 375px and desktop; OG preview looks right
- [ ] Unit tests pass; `npx wrangler deploy --dry-run` builds; existing worker
      tests untouched
- [ ] After merge: Apple Support URL requirement is satisfied by the live page

## Process conventions (house rules)

- Branch `feat/landing-page` off `main`; PR with the standard footer; Joe (or
  the coordinating session) merges.
- If working from a worktree: use RELATIVE paths inside the worktree, never
  absolute paths into the main checkout (standing gotcha).
- Update the videx-wiki from the same branch if you add operational knowledge
  (e.g. a "worker HTML pages" concept page is optional but welcome).
- After it's live: tell Joe so he can paste the URL into both store listings'
  Support/Website fields (see the Store Submission Pack artifact).
