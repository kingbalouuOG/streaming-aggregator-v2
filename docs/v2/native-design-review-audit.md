# Native vs Existing App — Design & Code Review Audit

**Date:** 2026-06-13. **Purpose:** support Joe's design-review pass aligning the native (RN) app to the existing app's UI. **Method:** 4 parallel code-review agents (Home/For You · Detail/Browse/Watchlist · Onboarding/Auth · Profile/Settings) comparing `native/src/**` against `src/**` and the `Pictures\Videx` reference screenshots, plus on-device captures. **No code was changed** — this is the audit only.

## 0. Source of truth (read first — it flips many findings)

Two agents independently found the **reference screenshots disagree with the current web code**: the web `OnboardingFlow.tsx` looks *older* than the screenshots, while `ProfilePage.tsx` was refactored to an "editorial hairline" style *newer* than the screenshots. The web code is mid-refactor and internally inconsistent.

**Resolution: the `Pictures\Videx` screenshots are the target** — they're Joe's captures of the live app (memory `reference_design_screenshots.md`: "current-app visual targets"). Confirmed against the existing-app `Home.png`. Therefore:
- A native↔screenshot divergence = **real, actionable.**
- A native↔web-code divergence where native **matches the screenshot** = **NOT a defect** (stale web code). The native onboarding + carded Profile are correct against the screenshots.
- Design-system token/quality bugs are real regardless of which UI is "ahead."

**The native build is a strong structural match on most screens.** The gaps are: (1) one systemic token bug, (2) incomplete poster-card anatomy, (3) several missing Home sections + Profile sub-screens, (4) a few capability gaps.

---

## 1. Cross-cutting fixes (highest leverage — fix once, helps everywhere)

| # | Issue | Detail | Screens affected | Sev |
|---|---|---|---|---|
| X1 | **Salmon kicker, should be brand orange** | Native uses `text-primary-on-soft` (`#ff8d5a`) for section/row/note kickers; `#ff8d5a` is specced only for text *on a primary-soft fill*. Kickers should be `text-primary` (`#e85d25`). | Home, For You, Detail, Browse, Watchlist, Profile, EditorNote | **High** |
| X2 | **Poster cards missing their anatomy** | `PosterCard`/`PosterGridCard` are bare poster+title+meta. The existing card (ContentCard) carries: top-left **service stack** (with badge-glow), top-right **glass bookmark** (+ watched tick), bottom-left **★ rating pill**. All absent natively. | every row + grid (Home, For You, Detail "more like this", Browse, Watchlist) | **High** |
| X3 | **Poster aspect ratio wrong** | Native posters are `2:3` (0.667); the design is `5:7` (0.714). Every card is the wrong shape. | all poster surfaces | **High** |
| X4 | **Active chip = solid cream, should be soft-orange** | Native active pills paint `bg-foreground` (cream) + dark text; design is `bg-primary-soft` + `text-primary` + orange-50% border. | Browse categories, Watchlist segments, (onboarding chips OK) | **High** |
| X5 | **Card title/meta typography** | Native title 13px/700; design 14px/600. Meta native "YEAR · genre" 13px mixed-case; design "GENRE · YEAR" **11px/500 UPPERCASE** tracked, color faint (40% not 62%). | all poster cards | **High** |
| X6 | **Missing font cuts** | Design uses **DM Sans 600** (card titles, Play CTA, rating pill, active chip) and **Fraunces 500** (editor-note teaser); native loads only DM Sans 400/500/700 + Fraunces 600/700/800 → weight substitutions. | global | **Med** |
| X7 | **"See all" affordance + per-service kicker tint absent** | The existing `ContentRow`/SectionHead has a trailing "See all →" (visible on every row in `Home.png`) and supports a service-tinted kicker ("NEW ON NETFLIX"). Native ContentRow has neither (no `right` slot, no `kickerColor`). | Home, For You rows | **High** |
| X8 | **Service badge sizes + "+N" overflow** | Native badge md=26 (should be 24), sm=18 (→20), lg=34 (→32); `contentFit="contain"` (→cover); stack `max=3` (→4); **no "+N" overflow pill**; no lettered fallback. | anywhere badges render | **Med** |
| X9 | **CTA radius/size + selected-border opacity** | Native primary CTAs are `rounded-card` (12px) + 18px label; design is ~16px/pill + ~15px label. Native selected cards use full-strength `border-primary`; design uses `border-primary/50`. | onboarding, auth, sub-screens | **Med** |
| X10 | **Solid `bg-card` vs translucent fills** | Native form fields/selectable cards use solid `#14141c`; the design uses translucent `bg-secondary`/`secondary/60` + `border-subtle` hairline (recessed look). | onboarding, auth, services grids | **Med** |

---

## 2. Per-screen findings (prioritized, de-duplicated)

### Home (`(tabs)/index.tsx`)
- **HIGH — Missing sections.** Existing Home (`Home.png`) has: Recently Added → **Trending Across Your Services (numbered Top-5 chart)** → **Coming Soon** → **Critically Acclaimed** → Popular on each service → genre spotlights, every row with **"See all"**. Native has hero → editor's note → browse chips → "Top on {service}" → spotlights. Missing: the **numbered chart**, **Critically Acclaimed**, **Coming Soon/Calendar**, **editorial-spotlight lead card**, and the **See-all** affordance. (Free Tonight / WideCard Critics' row also absent.)
- **HIGH — Per-service row copy.** Native "Top on" + bare service name; existing "RECENTLY ADDED TO YOUR SERVICE" / per-service rows with service-tinted kickers + sentence titles.
- **MED — Hero extras.** Existing hero supports "IN YOUR PLAN" pill + badge drop-shadow halo + glass-blur action buttons; native omits all three. Native hero is non-interactive (no bookmark state).
- **MED — Spacing.** Native hero→note→chips gaps are 24–28px; design ~16px. Row-to-row 28px vs 24px.
- Note: native added an **Editor's Note card + Browse-by chips** near the top that the existing `Home.png` doesn't foreground — confirm placement with the live app.

### For You (`(tabs)/foryou.tsx`)
- **HIGH — Heavily reduced** vs the existing For You (`For You.png`): native = 1 hero + ≤4 flat rows; existing has taste-fingerprint chips, mood-chip refiner, cover-story mood room, calendar strip, kickered rows. Known scope reduction.
- **MED — Rows have no kickers** (just titles); existing rows carry taxonomic kickers.

### Detail (`detail/[id].tsx` + WhereToWatch/WatchlistActions/DetailEngagement/ReportSheet)
- **HIGH — RT badge is a 🍅 emoji**, should be the RT logo PNG (`src/assets/rotten-tomatoes-logo.png`); IMDb `★` should be the lucide Star. (Design system: "avoid emoji.")
- **HIGH — Hero status badge missing** (top-right watched/bookmarked chip).
- **HIGH — ReportSheet is a different design**: missing grabber pill; native title "Report availability" (Fraunces 18) vs "FEEDBACK / Report a problem." (kicker + Fraunces 22); right-side check-circle rows vs left hollow-radio; multiline notes vs single-line; no submit-disabled gating.
- **MED — Watchlist dual buttons**: native 13px labels (→14px), missing the watched→"Undo Watchlist" state and the distinct emerald "Watched" pill; no icon spring.
- **MED — Thumbs/not-interested row**: native thumbs are 48×40 with a text-labelled "Not interested"; design is 32×32 icon-only, inline-right of the rating badges (one row). 
- **MED — Description** 13px→14px; only show "Show more" when it actually overflows.
- **MED — "More like this"** missing the "N titles" count + the cards lack X2 anatomy.
- **LOW** — rating-badge radius (10→8px), cast avatar radius (20→16px) + tile bg (`card`→`secondary`), rent/buy trailing ExternalLink icon, meta separators.

### Browse (`(tabs)/browse.tsx`)
- **HIGH — Missing the whole filter system**: Edit-filters pill + FilterSheet (service/cost/runtime/genre/rating/language/watched), active-filter strip, "Build your search" CTA.
- **HIGH — Missing sort control**, **mood chips** (empty state), **recent searches**, **as-you-type suggestions** + semantic CTA.
- **MED — Search input**: text 13→14px, placeholder copy, search-icon opacity (62→40%), clear-X should be a pill chip.
- **MED — Category pills**: X4 (active state) + missing the "FILTER" kicker above the row.
- **MED — Result grid**: X2/X3/X5 (card anatomy, 2:3→5:7, title/meta), side padding 14→20px.

### Watchlist (`(tabs)/watchlist.tsx`)
- **HIGH — Missing list view + swipeable cards**, **category filter pills** (with counts), **sort control**.
- **MED — Missing**: watched-progress bar, tab icon+count, dashed "Add titles" grid card.
- **MED — Grid card** lacks X2 anatomy + remove/move button + (watched-tab) inline thumbs; 2:3→5:7.
- **MED — Segment control** = X4; missing icon+count.
- **MED — Header** introduces a 28px Fraunces "Watchlist" title the existing app doesn't have (chip-only header); and the **empty state** should be editorial (kicker + 28px headline + standfirst + "Browse content →"), not a centered icon tile.

### Onboarding (5 steps) — **native largely MATCHES the screenshots** (copy, "Step N · Title" chrome, captions, summary card, slider captions). Web code is stale here; don't copy it. Real items:
- **HIGH — Cluster names truncated** (data regression in `src/lib/taste-v2/tasteClusters.ts`): "Mind-Bending", "True Crime", "Rom-Coms & Love", "Award-Winners" — screenshots show the full names ("Mind-Bending Mysteries", "True Crime & Real Stories", "Rom-Coms & Love Stories", "Prestige & Award-Winners"). Affects Step 4 + Profile Your-Taste (shared data).
- **HIGH — Username availability is format-only** (no server `checkUsernameAvailable`); a taken username passes onboarding then fails at signUp. Capability gap (see §3).
- **MED — Step 2 selection check** is inline (right of text); screenshot shows it **top-right corner** of the card.
- **MED — Step title weight inconsistent** (Step 1 = Fraunces 700, Steps 2–5 = 800); standardize.
- **MED — Field fills** solid vs translucent (X10); **hero icon** flat `bg-primary` vs gradient.
- **MED — Step-shell padding** inconsistent (Step 1 `px-6`, Steps 2–5 `px-5`).
- **LOW — Back button shows on Step 1** (screenshot has none until Step 2); chip radius should be pill (`rounded-pill`) not 12px; "{n}/5" counter should be tabular 12px; progress track empty-segment alpha 0.10→0.05; Step 5 "You can change any of this later in Profile" sub-copy missing; stat numerals should be sans/brand-orange not Fraunces/salmon.

### Auth / Sign-in (`auth/AuthScreen.tsx`) — no screenshot in the set; compared to web:
- **HIGH — "Forgot password?" link missing** (+ no `forgotPassword` in the provider — capability gap).
- **MED — Title** 40px/800 (vs headline 28px/600); **hero icon** flat (→gradient); **field fills** solid (→translucent); no focus border; no `canSubmit` (≥8-char) gating.

### Profile (`(tabs)/profile.tsx` + sub-screens + tab bar) — **native MATCHES the screenshots' carded layout** (web's hairline refactor is newer; don't copy it). Real items:
- **HIGH — Row glyph tiles are monochrome cream/orange; screenshots show per-row COLORED tiles** (Account=blue, Streaming=purple, Spend=green, Taste=orange, Tune=amber, Appearance=indigo, Privacy=slate). Needs `GenreIconTile` to accept a tint (currently hard-codes `#e85d25`/`#f5f1e8`). Same colored treatment appears in the Privacy/Spend row glyphs.
- **HIGH — Header typeface**: "Profile" + all sub-screen titles are Fraunces; screenshots are **DM Sans bold** (sans-serif). Change titles to `font-sans-bold`.
- **HIGH — Browse tab icon is a Compass; should be a magnifying glass (Search)** (every screen).
- **HIGH — Missing sub-screens**: **Monthly Spend** (full dashboard — `Spend analysis 1/2.png`) and **Privacy & Data** (intro + "what Videx learns" modal + Privacy/Terms links + Download-my-data + Delete-account confirm — `Privacy & data 1-3.png`) are "Coming soon" stubs. **Account Details** is read-only; screenshot shows editable Name/Email + "Save Changes".
- **HIGH — Your Taste layout**: native lands on the full 16-cluster grid; screenshots show a **summary (prose + selected chips) + "Refine preferences" / "Retake taste quiz"** landing, grid only after Refine (+ a "{n} selected" pill and a MAX cap).
- **HIGH — Appearance missing the "System" option** (screenshots show Light/Dark/System radio rows; native has Dark + disabled "Light — coming soon").
- **MED — Main page**: "Member since {month year}" line missing; placeholder subtitles ("View your spend", "Genres you love") should be computed ("£39.95 / month", "6 genres selected", "Balanced across all sliders"); stat numerals should be DM Sans not Fraunces; avatar needs the 2px primary ring+offset.
- **MED — Tab bar**: no active-state **filled** icons (Home/Watchlist/Profile); labels use system font not DM Sans 10px; inactive tint 0.62 (→0.40); no Watchlist unread dot.
- **MED — Streaming Services sub-screen**: subtitle should be "Connected/Not connected" status (not the catalog description); unselected tiles should be dimmed (`opacity-60`).
- **MED — Sub-screen header**: back button is a circle; screenshots show a rounded-square (10px). "Tune Recommendations" header should read "Tune Your Recommendations".
- **LOW** — Tune slider end-label copy ("Best match regardless of age", "Focus on films/TV series"); Tune/Services explicit Save vs the screenshots' auto-save; data-source attribution footer.

---

## 3. Capability gaps (native auth provider exposes only signIn/signUp)
- **`checkUsernameAvailable`** — needed for onboarding Step 1's real availability check (currently format-only). RPC exists (`username_available`, used by web `AuthContext`).
- **`forgotPassword`** — needed for the Auth screen's "Forgot password?" link.

Both are functional gaps, not just visual. Add to `native/src/providers/auth.tsx`.

---

## 4. Recommended fix sequencing for the design-review phase

1. **Token + primitives pass (1 commit, fixes the most surface area):** X1 (kicker color), X6 (load DM Sans 600 + Fraunces 500), X8 (badge sizes/overflow), X9/X10 (CTA + fills), Profile header typeface, Browse tab icon. Cheap, global, high visual impact.
2. **Poster card anatomy (1 focused piece):** X2 + X3 + X5 — bring `PosterCard`/`PosterGridCard` up to the ContentCard contract (service stack + bookmark + ★ pill, 5:7, 14px/uppercase meta). Fixes Home, For You, Detail, Browse, Watchlist cards at once.
3. **ContentRow header:** X7 (See-all + per-service kicker tint + standfirst slot).
4. **Profile colored glyph tiles** (X-profile) + computed subtitles + member-since + Appearance System row.
5. **Per-screen detail fixes** (Detail RT logo + status badge + ReportSheet redesign + thumbs row; Browse/Watchlist active-pill states; onboarding cluster-name data fix + Step 2 check position + capability gaps).
6. **Larger missing pieces (own phases):** Home missing sections (Charts/Critically Acclaimed/Coming Soon/See-all), Browse filter system + sort + moods + recents, Watchlist list-view + swipe, Profile Spend + Privacy + Account-edit screens, For You full composition.

**Quick wins (visible, low-effort):** X1 kicker color, Browse tab icon (Compass→Search), RT emoji→logo, cluster-name data restore, Profile header typeface, "Member since" line, Appearance System row.
**Big rocks (own phases):** poster-card anatomy, Home missing sections, Browse filter system, Watchlist list/swipe, Profile Spend + Privacy screens, For You composition.
