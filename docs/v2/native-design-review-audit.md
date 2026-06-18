# Native vs Existing App — Design & Code Review Audit

**Date:** 2026-06-13 · **Rev v2:** 2026-06-15 — reconciled against the authoritative design handoff.

> **⚠️ Rev v3 — 2026-06-17 — SUPERSEDED IN PART.** Most of the "missing / → Track 2"
> findings below have since SHIPPED on `phase-native-polish-gaps` and must NOT be read as
> open gaps: the full Browse filter system + sort + mood chips + FilterSheet + **semantic
> mood search** (behind the `search_semantic` flag), the richer For You composition
> (TasteFingerprint / MoodRooms / WatchlistListRow / WideCard), the Detail RT badge (uses
> the RT logo PNG, not an emoji), Profile Monthly Spend + Privacy as full screens, the
> Search-icon Browse tab, the in-app feedback loop, and loading skeletons. The §4 Track-2
> component list is all built + wired. Treat this doc as historical; the current launch
> state is [`native-4-cutover-runbook.md`](native-4-cutover-runbook.md) + the pre-launch
> audit. Genuinely-open items: typography/opsz polish + minor badge-anatomy nits.
**Purpose:** support Joe's design-review pass aligning the native (RN) app to the existing app's UI.
**Method:** 4 parallel code-review agents (Home/For You · Detail/Browse/Watchlist · Onboarding/Auth · Profile/Settings) comparing `native/src/**` against `src/**` and the `Pictures\Videx` reference screenshots, plus on-device captures. **Rev v2** folds in Joe's **design handoff** (`Downloads\Videx-design-references\design_handoff_videx\`) — machine-readable tokens (`tokens.json`/`tokens.css`) + the `videx-design-system.html` change matrix — which is now the top source of truth. **No code has been changed** — this is the audit only.

**Scope decision (Joe, 2026-06-15): PHASED.** Track 1 (now) restyles the surfaces native already has → unblocks the NATIVE-4 cutover. Track 2 (tracked follow-on) builds the missing editorial surfaces. See §4.

## 0. Source of truth (read first — it flips several findings)

Rev v1 had only the screenshots to go on and flagged that the web code was mid-refactor and internally inconsistent. **Rev v2 adds the authoritative spec:** the **design handoff** is "Editorial Direction A," the system Joe built the live app from. It ships machine-readable tokens and a change matrix mapping every component to Unchanged / UI-Update / Redesign / New. Verified: the live web app substantially implements it (`MagazineHero`, `EditorsNote`, `FreeTonight`, `MoodRoom*`, `NumberedChart`, `SectionHead`, `Kicker`, `WideCard`, `SpendDashboard` all exist in `src/components/`).

**Precedence, highest first (screenshots dropped — see warning):**
1. **`tokens.json` / `videx-design-system.html`** (design handoff) — exact values (color, type, opsz, spacing, radii, motion, component anatomy). Wins on any numeric/values question.
2. **Web `src/**`** — the *current* built reference; the live app the native port must match.

> **⚠️ Screenshots removed as a source (Joe, 2026-06-15).** The `Pictures\Videx` captures are a STALE, pre-current-icons snapshot and mislead. Confirmed against web `ProfilePage.tsx`: the live app uses **monochrome** glyph tiles, **inline** stat pills, only the bookmark icon orange (others muted), a **Fraunces** header, and an **orange** Sign Out — where the screenshots show colored tiles, big stat cards, green/blue stat icons, a sans header, and a red Sign Out. **Any §2 finding phrased "screenshots show…" or "native matches the screenshot" is SUPERSEDED by the web component** — re-derive Profile + onboarding specifics from `src/components/*`. (In particular: native's carded Profile rows should become web's editorial **hairline list-rows**; the v1 claim "don't copy web's hairline" is reversed.)

Consequences: a native↔spec divergence on a value is **real**. A native↔web divergence is a defect unless the design handoff says otherwise. **The aspect-ratio finding is corrected by the spec (see X3).**

**The native build is a strong structural match on the surfaces it has.** The gaps are: (1) one systemic token bug (kicker color), (2) incomplete poster-card anatomy, (3) a typography system gap (Fraunces `opsz` per role), (4) missing editorial surfaces, (5) a few capability gaps.

### 0.1 Authoritative tokens (from the handoff — implement these, stop eyeballing)

| Group | Values |
|---|---|
| **Surfaces** | bg `#0a0a0f` · bg-elev `#111118` · bg-card `#161620` · bg-soft `#1e1e2a` |
| **Text** | cream `#f5f1e8` · fg `#f0f0f5` · muted `#8888a0` · dim `rgba(240,240,245,.55)` |
| **Brand** | primary `#e85d25` (RESERVED: kickers, primary CTAs, active nav, Editor's Note mark) · soft `rgba(232,93,37,.16)` · edge `rgba(232,93,37,.45)`. `#ff8d5a` is ONLY the "In your plan" cost-pill text — never a kicker. |
| **Accents** (taste hues; mood chips/rooms only, never branding) | plum `#a16ed4` · teal `#3fb6a1` · gold `#e3b04b` · rose `#e16b8c` · blue `#5b8def` · sage `#7fb37b` |
| **Type families** | display = Fraunces · ui = DM Sans · mono = JetBrains Mono |
| **Type ramp** | hero 44 · display 32 · section 22 · standfirst 17 · card-title 13 · kicker 11 · body 13.5 · meta 10.5 · button 12 |
| **Fraunces `opsz` per role (mandatory)** | hero 144 · display/dropcap 96 · section title 36 · body 18 · card title 12 |
| **Spacing** | 2xs 4 · xs 8 · sm 12 (card gap) · md 16 · lg 22 (section gutter) · xl 32 (between sections) · 2xl 48 |
| **Radii** | xs 6 · sm 10 (badges) · md 14 (cards, hero/primary CTA) · lg 20 (sheets) · pill 999 (chips, ratings, chip-buttons) |
| **Motion** | ease-lift `cubic-bezier(.2,.7,.3,1)` · ease-snap `cubic-bezier(.2,.8,.2,1)` · fade 400 · press 150 · hover-lift 350 · sheet 250 · shimmer 2400 |
| **Icon stroke** | 1.8 line · 2.4 active |

---

## 1. Cross-cutting fixes (highest leverage — fix once, helps everywhere)

| # | Issue | Detail (✅ confirmed / ⚠️ corrected / 🔧 refined by the spec) | Screens | Sev |
|---|---|---|---|---|
| X1 | **Salmon kicker, should be brand orange** | ✅ Native uses `text-primary-on-soft` (`#ff8d5a`) for kickers; spec reserves `#ff8d5a` for the "In your plan" cost-pill text only. Kickers must be `text-primary` (`#e85d25`). | Home, For You, Detail, Browse, Watchlist, Profile, EditorNote | **High** |
| X2 | **Poster cards missing their anatomy** | ✅ `PosterCard`/`PosterGridCard` are bare poster+title+meta. Spec ContentCard contract: top-left **ServiceStack** (≤3 then `+N`, 1.5px card-bg ring, −32% overlap), top-right **bookmark** (28×28, `rgba(0,0,0,.45)`+8px blur, outline→filled), bottom-left **gold ★ rating pill**. **No cost/plan pill on cards** (restraint principle). | every row + grid | **High** |
| X3 | ~~Poster aspect ratio wrong~~ → **CORRECTED: native is right** | ⚠️ v1 said `2:3 → 5:7`. The spec pins the default ContentCard at **`2:3`** (`.demo-card { aspect-ratio: 2/3 }`); there is **no 5:7**. Native's existing `2:3` is correct — **retracted, no change.** Variants: `lead` **3:4.6**, `wide` **16:10** (the `wide` backdrop card is a *new* variant for Critics'/Outside-your-usual rows → Track 2). | all poster surfaces | ~~High~~ **Resolved** |
| X4 | **Active chip fill — two different components** | 🔧 Native active pills paint `bg-foreground` (cream). Spec splits: **filter/category/segment chips** active = `bg-primary-soft` + `text-primary` + orange-45% border (the fix). **Mood chips** (For You) active = the **mood's own accent hue** at 12% bg / 45% border, *not* orange. | Browse categories, Watchlist segments (orange); For You mood chips (accent) | **High** |
| X5 | **Card title/meta typography** | 🔧 Title: spec is **Fraunces 13 / 600, `opsz 12`** (native renders 13/**700**, weight is the bug — size 13 is right; v1's "14px" was wrong). Meta: **DM Sans 10.5 / 500 UPPERCASE** `GENRE · YEAR`, color `rgba(245,241,232,.55)`. | all poster cards | **High** |
| X6 | **Typography system gap — weights + the `opsz` axis** | 🔧 Two parts. (a) *Easy:* load **DM Sans 600** + **Fraunces 500** (currently substituted). (b) *Hard, native-specific:* **Fraunces `opsz` must be set per role** (144/96/36/18/12). Web uses `font-variation-settings`; RN has no per-element equivalent → ship **pre-baked static Fraunces cuts** at those optical sizes (or prove an Expo variable-font path). The spec is emphatic: without opsz, Fraunces "looks generic." | global | **High** |
| X7 | **"See all" affordance + per-service kicker tint absent** | ✅ Spec SectionHead has an optional right-aligned action (DM Sans 11/600 uppercase + `chev`) and a colour-prop kicker (service-tinted "NEW ON NETFLIX"). Native ContentRow has neither (no `right` slot, no `kickerColor`). | Home, For You rows | **High** |
| X8 | **Service badge sizes + "+N" overflow** | 🔧 Spec: **standalone** ServiceBadge sm **28** / md **38** / lg **48**, radius `sm` (10px, ≈0.27×); **in-card stack** ≈22 with 1.5px ring + −32% overlap, **max 3 then `+N`**. Native md=26/sm=18/lg=34, `contentFit="contain"` (→cover), stack max=3 w/ no `+N`. | anywhere badges render | **Med** |
| X9 | **CTA radius — context-split** | 🔧 v1 said "→ ~16px/pill." Spec: **hero & primary CTAs = 14px (`radius-md`) filled cream**; **pill (999px) only for chip-style buttons/ratings**. So native's `rounded-card` (14px) primary CTAs are essentially correct — keep 14px cream, don't pill them. Selected cards: spec uses `border-primary/50` (native uses full-strength). | onboarding, auth, hero, sub-screens | **Low** |
| X10 | **Solid `bg-card` vs translucent fills** | ✅ Native form fields/selectable cards use solid `#14141c`; spec uses translucent `bg-soft`/alpha fills + hairline border (recessed look). | onboarding, auth, services grids | **Med** |

---

## 2. Per-screen findings (prioritized, de-duplicated)

### Home (`(tabs)/index.tsx`)
- **HIGH — Missing sections (→ Track 2).** Spec Home order: Magazine Hero → Editor's Note → filter chips → Recently Added (mosaic: 1 lead + 2 std) → **Trending ribbon (ranked 1–4, big Fraunces numerals)** → **Editorial Spotlight** → New-on-each-service rows → **Free Tonight** (iPlayer/ITVX/C4, leaf-green kicker) → **Critics' Picks** (`wide` cards) → **On the calendar** (date pills). Native has hero → note → chips → "Top on {service}" → genre spotlights. Missing: trending ribbon, editorial spotlight, free-tonight, critics/wide row, calendar strip, **See-all** on every row.
- **HIGH — Per-service row copy.** Native "Top on" + bare name; spec PerServiceRow = ServiceBadge + service name + "See all", service-tinted kicker.
- **MED — Hero extras.** Spec Magazine Hero: 16:11 backdrop, bottom gradient, kicker + Fraunces ~36/opsz96 title + italic standfirst, **primary CTA = 14px filled cream** + ghost "More info", bookmark top-right, 3 swipe dots, **auto-advance off**. Native hero omits the bookmark state + CTA treatment.
- **MED — Spacing.** Section gutter should be **22px**, between-section **32px**, card gap **12px** (native gaps run wide).
- Note: native's Editor's Note card is the **collapsed strip** only; spec adds tap-to-expand **bottom-sheet** w/ drop cap (→ Track 2).

### For You (`(tabs)/foryou.tsx`)
- **HIGH — Heavily reduced (→ Track 2, the biggest single gap).** Native = 1 `MagazineHero` + 4 flat `ContentRow`s (code comments the rest "deferred"). Spec For You is a **10-section editorial redesign**: greeting header → Top Pick (+reasoning) → **Taste Fingerprint** (6 archetype sparklines) → mood-chip refiner → filtered mood mosaic → **Cover-Story Mood Room** → **2×2 mood-tile grid** → because-you-watched (+"Why?") → **watchlist list-rows** (poster+meta+Play) → Outside-your-usual (`wide` band).
- **MED — Rows have no kickers**; spec rows carry taxonomic kickers.

### Detail (`detail/[id].tsx` + WhereToWatch/WatchlistActions/DetailEngagement/ReportSheet)
- **HIGH — RT badge is a 🍅 emoji**, should be the RT logo PNG (`src/assets/rotten-tomatoes-logo.png`); IMDb `★` should be the lucide Star. (Spec: avoid emoji.)
- **HIGH — Hero status badge missing** (top-right watched/bookmarked chip).
- **HIGH — ReportSheet design drift**: adopt the spec sheet chrome — `#13131a` surface, **38×4 grabber pill** 16px from top, kicker + close-button header w/ 14px bottom border, `vxSlideUp 250ms ease-snap`, scrim `rgba(0,0,0,.7)`+6px blur. Native is missing the grabber + uses Fraunces-18 title vs kicker+Fraunces-22; submit gating absent.
- **MED — Availability** (per change matrix): deep-link pills become a **single grouped row with one primary CTA per service**.
- **MED — Watchlist dual buttons**: 13→14px labels, add watched→"Undo" state + emerald "Watched" pill, icon spring.
- **MED — Thumbs/not-interested**: spec 32×32 icon-only, inline-right of the rating badges; native is 48×40 with a text label.
- **MED — Description** 13→14px; "Show more" only when it overflows.
- **MED — "More like this"** missing "N titles" count + X2 card anatomy.
- **LOW** — rating-badge radius 10→8, cast avatar radius 20→16 + tile bg card→soft, rent/buy trailing ExternalLink icon, meta separators.

### Browse (`(tabs)/browse.tsx`)  *(change matrix: UI Update — but the filter system is a Track-2 build)*
- **HIGH — Missing the whole filter system (→ Track 2)**: Edit-filters pill + FilterSheet (service/cost/runtime/genre/rating/language/watched), active-filter strip, "Build your search" CTA.
- **HIGH — Missing sort control, mood chips (empty state), recent searches, as-you-type suggestions + semantic CTA (→ Track 2).**
- **MED — Search input**: 13→14px, placeholder copy, icon opacity 62→40%, clear-X as a pill chip.
- **MED — Category pills**: X4 (filter-chip active = primary-soft) + add the "FILTER" kicker.
- **MED — Result grid**: X2 + X5 anatomy/typography, side padding 14→**22px**. *(No aspect change — 2:3 stays, per X3.)*

### Watchlist (`(tabs)/watchlist.tsx`)
- **HIGH — Missing list view + swipeable cards (→ Track 2)**, category filter pills (w/ counts), sort control. Spec adds the shared **WatchlistListRow** (poster thumb + title + meta + Play).
- **MED — Missing**: watched-progress bar, tab icon+count, dashed "Add titles" grid card.
- **MED — Grid card** lacks X2 anatomy + remove/move button + (watched-tab) inline thumbs. *(2:3 stays.)*
- **MED — Segment control** = X4; missing icon+count.
- **MED — Header/empty state** should be editorial (kicker + 28px headline + standfirst + "Browse content →"), not a centered icon tile.

### Onboarding (5 steps) — **native largely MATCHES the screenshots** (change matrix: UI Update; web code is stale here, don't copy it). Real items:
- **HIGH — Cluster names truncated** (data regression in `src/lib/taste-v2/tasteClusters.ts`): "Mind-Bending", "True Crime", "Rom-Coms & Love", "Award-Winners" → full names ("Mind-Bending Mysteries", "True Crime & Real Stories", "Rom-Coms & Love Stories", "Prestige & Award-Winners"). Affects Step 4 + Profile Your-Taste (shared data).
- **HIGH — Username availability is format-only** (no server `checkUsernameAvailable`) — see §3.
- **MED — Step 2 selection check** should be the card's **top-right corner** (native is inline-right).
- **MED — Step title weight** inconsistent (Step 1 Fraunces 700 vs Steps 2–5 800) — standardize on the spec section role (Fraunces 600/opsz36 for step headlines).
- **MED — Field fills** solid vs translucent (X10); hero icon flat vs gradient.
- **MED — Step-shell padding** inconsistent (Step 1 `px-6`, Steps 2–5 `px-5`).
- **LOW** — Back button on Step 1 (none until Step 2); mood/age chip radius → pill; "{n}/5" tabular 12px; progress empty-segment alpha 0.10→0.05; Step 5 "You can change any of this later in Profile" sub-copy; stat numerals sans/brand-orange not Fraunces/salmon.

### Auth / Sign-in (`auth/AuthScreen.tsx`) — change matrix: UI Update (brand mark added). Real items:
- **HIGH — "Forgot password?" link missing** (+ no `forgotPassword` in the provider — §3). Spec ForgotPasswordScreen/ResetPasswordScreen exist on web.
- **MED — Inputs** to spec: cream-on-bg-elev, 10px radius, DM Sans; Fraunces headline; translucent fills; focus border; `canSubmit` (≥8-char) gating. Add the Fraunces **V** brand mark at top.

### Profile (`(tabs)/profile.tsx` + sub-screens + tab bar) — **native MATCHES the screenshots' carded layout** (web's hairline refactor is newer; don't copy). Real items:
- **HIGH — Row glyph tiles are monochrome; screenshots show per-row COLORED tiles** (Account=blue, Streaming=purple, Spend=green, Taste=orange, Tune=amber, Appearance=indigo, Privacy=slate). `GenreIconTile` needs a tint prop (hard-codes `#e85d25`/`#f5f1e8`).
- **HIGH — Header typeface**: "Profile" + sub-screen titles are Fraunces; screenshots are **DM Sans bold**. Change to `font-sans-bold`.
- **HIGH — Browse tab icon is a Compass; should be the Search (magnifying glass)** — spec tab set is `home · sparkles · search · bookmark · user`, order Home·For You·Browse·Watchlist·Profile.
- **HIGH — Missing sub-screens (→ Track 2)**: Monthly Spend dashboard (`Spend analysis 1/2.png`) + Privacy & Data (`Privacy & data 1-3.png`) are stubs; Account Details is read-only (screenshot shows editable Name/Email + Save).
- **HIGH — Your Taste layout**: native lands on the 16-cluster grid; screenshots show a **summary + "Refine preferences" / "Retake taste quiz"** landing, grid only after Refine.
- **HIGH — Appearance missing "System"** (Light/Dark/System rows; native has Dark + disabled Light).
- **MED — Main page**: "Member since {month year}" missing; placeholder subtitles → computed ("£39.95 / month", "6 genres selected", "Balanced across all sliders"); stat numerals DM Sans not Fraunces; avatar 2px primary ring+offset.
- **MED — Tab bar**: surface should be the spec blur — `rgba(13,13,20,.85)` + 20px blur/180% sat, top border `rgba(255,255,255,.08)`; **active icons filled** (bookmark→`bookmarkF`), stroke 2.4, label DM Sans 9.5/700, inactive tint 0.40; Watchlist count badge.
- **MED — Streaming Services**: subtitle = "Connected/Not connected" status; unselected tiles dimmed (`opacity-60`).
- **MED — Sub-screen header**: back button rounded-square (10px) not circle; "Tune Recommendations" → "Tune Your Recommendations".
- **LOW** — Tune slider end-label copy; Tune/Services auto-save (vs explicit Save); data-source attribution footer.

---

## 3. Capability gaps (native auth provider exposes only signIn/signUp)
- **`checkUsernameAvailable`** — onboarding Step 1's real availability check (RPC `username_available` exists, used by web `AuthContext`; change matrix keeps the uniqueness check).
- **`forgotPassword`** — the Auth screen's "Forgot password?" link.

Both are functional gaps. Add to `native/src/providers/auth.tsx`.

---

## 4. Fix sequencing — PHASED (Joe's call, 2026-06-15)

### Track 1 — Restyle pass (NOW, pre-cutover): style the surfaces native already has
Goal: the existing native app *reads as the real Videx* so the NATIVE-4 cutover isn't blocked. No new surfaces.

1. **Typography foundation (highest "native feel" lever):** X6 — load DM Sans 600 + Fraunces 500, **and stand up the Fraunces `opsz` approach** (generate static cuts at 144/96/36/18/12, map to roles in the type scale). Prep task: produce/verify the static Fraunces files.
2. **Token + primitives pass (1 commit, most surface area):** X1 (kicker → `#e85d25`), X8 (badge sizes/`+N`/cover), X9 (keep 14px cream CTAs, `border-primary/50` selected), X10 (translucent fills), Profile header → DM Sans bold, Browse tab Compass→Search.
3. **Poster card anatomy (1 focused piece):** X2 + X5 — bring `PosterCard`/`PosterGridCard` to the ContentCard contract (ServiceStack + glass bookmark + gold ★ pill; Fraunces 13/600 title; DM Sans 10.5/500 uppercase meta). **Aspect stays 2:3 (X3 retracted).** Fixes Home/For You/Detail/Browse/Watchlist cards at once.
4. **ContentRow header:** X7 — See-all action slot + per-service `kickerColor` + standfirst slot. X4 filter-chip active = primary-soft.
5. **Profile polish:** colored glyph tiles (tint prop) + computed subtitles + "Member since" + Appearance System row + tab-bar blur/active-fill.
6. **Per-screen detail fixes:** Detail RT logo + status badge + ReportSheet chrome + thumbs row; Browse/Watchlist active-pill states; onboarding cluster-name data fix + Step 2 check position; capability gaps (§3).

**Quick wins (visible, low-effort):** X1 kicker color, Browse tab icon, RT emoji→logo, cluster-name restore, Profile header typeface, "Member since", Appearance System row.

### Track 2 — Editorial-parity (tracked follow-on): build the missing surfaces
Maps to the change matrix's **New / Redesign** rows. Each is its own phase; sequence after Track 1 lands (before or after cutover, Joe's call per item).
- **For You redesign** (the big one): Taste Fingerprint, mood-chip refiner, Cover-Story Mood Room + 2×2 grid, because-you-watched, watchlist list-rows, outside-your-usual.
- **Home editorial surfaces:** Trending ribbon (numbered), Editorial Spotlight, Free Tonight, Critics'/`wide` row, Calendar strip, Editor's Note expand-to-sheet.
- **Browse:** filter system + FilterSheet + sort + mood chips + recents + suggestions/semantic CTA.
- **Watchlist:** list view + swipe + category filters + sort + WatchlistListRow.
- **Profile:** Monthly Spend dashboard + Privacy & Data + Account-edit.
- **Shared primitives Track 2 needs:** `WideCard` (16:10), the sheet chrome primitive, `CoverStoryRoom`, `TrendingRibbon`, `TasteFingerprint`, `CalendarStrip`, `WatchlistListRow` — and the `wide` ContentCard variant.

> Authoritative values for all of the above live in `tokens.json` + `videx-design-system.html` (§0.1 summarizes). The reference JSX/HTML are prototypes — recreate in NativeWind, don't port. Only `logo-export/` is production-final artwork.
