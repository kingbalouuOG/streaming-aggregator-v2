# Videx — Redesign plan

Per-component checklist. One row = one PR. Tick the box when done. Do not bundle rows.

**Status legend**

- 🟢 **Unchanged** — logic kept, tokens auto-inherit
- 🔵 **UI Update** — restyle, no behaviour change
- 🟠 **Redesign** — anatomy or props changed
- 🟣 **New** — file does not exist today

> Read `docs/v3-design/design-system.md` and `docs/v3-design/CLAUDE.md` before starting any row.

---

## Phase 0 — Foundation (must land first, blocks all phases)

- [x] **`src/index.css`** — 🟠 Replace tokens with `docs/v3-design/tokens.css`. Preserve any non-design tokens (e.g. capacitor inset vars). DoD: `:root` exposes every var listed in `design-system.md §3`.
- [x] **`src/components/icons.tsx`** — 🔵 Add: `bookmark`, `bookmarkF`, `close`, `chev-right`, `chev-down`, `expand`, `play-fill`, `sparkle`. All 1.8 stroke, 24×24 viewbox.
- [x] **`src/components/SectionHead.tsx`** *(new)* — 🟣 Props: `kicker?: string`, `title: string`, `standfirst?: string`, `right?: ReactNode`. Used by every row.
- [x] **`src/components/Kicker.tsx`** *(new)* — 🟣 Tiny wrapper for kicker text style (tracked uppercase orange).

## Phase 1 — Card primitives

- [x] **`src/components/ContentCard.tsx`** — 🟠 New anatomy: bookmark TR (28×28, blur), rating pill BL only, no plan pill, no "new" ribbon. Variants: `default | wide | lead | mosaic`. Title and meta below. DoD: matches anatomy in `design-system.md §4`.
- [x] **`src/components/BrowseCard.tsx`** — 🔵 Adopts new ContentCard primitive in grid form. Maintain same hooks.
- [x] **`src/components/ServiceBadge.tsx`** — 🔵 24×24 squares; ServiceStack overlaps -8px; cap at 4 + `+N`.
- [x] **`src/components/ComingSoonCard.tsx`** — 🔵 Adopts CalendarStrip styling (date pill in primary, title under).

## Phase 2 — App chrome

- [x] **`src/components/BottomNav.tsx`** — 🔵 Restyle to blurred surface + new icons. No API change. Watchlist dot for unread.
- [x] **`src/App.tsx`** — 🔵 Audit for hard-coded colours / fonts; replace with tokens. No structural change.
- [x] **`src/components/ThemeContext.tsx`** — 🔵 Default `dark`. Toggle writes `data-theme` on `<html>`. No more in-component theme branching.

## Phase 3 — Reference screen (gold standard)

- [x] **Home** — 🟠 Land this before any other screen. Order: Magazine hero → Editor's Note → Recently added (mosaic) → Charts → Editorial spotlight → 3 per-service rows → Free tonight → Critics' Picks → Calendar strip. Wires:
  - `useHomeContent` already returns most of this; add `editor_notes` table query.
  - Editorial spotlight: editorial-curated single title, falls back to top-trending.
  - Free tonight: `recommendations-v2/rows/home/freeTonightRow.ts` (existing).
  - DoD: pixel parity with `Videx Portfolio.html` Home frame at 390 width.

## Phase 4 — Screen-by-screen

- [x] **`ForYouPage`** — 🟠 New section order (`design-system.md §5`). Mood chip refiner sits **above** "In your mood" (not as a primary nav). Cover-Story mood room block (1 featured + 3 supporting).
- [x] **`DetailPage`** — 🟠 Editorial hero (full-bleed image + Fraunces title overlay). New "Where to watch" stack. Restyled chapter list.
- [x] **`WatchlistPage`** — 🔵 Want-to-Watch / Watched tabs as editorial chips. Empty state with editor's note tone.
- [x] **`BrowsePage`** — 🔵 New BrowseCard, restyled CategoryFilter (chip bar), search input adopts paper/ink surface.
- [x] **`ProfilePage`** — 🔵 Settings list-row style. Service connections as ServiceBadge stack with chevrons.
- [x] **`CalendarPage`** — 🔵 Date pills new chip style. Service filter row as chips.
- [x] **`SpendDashboard`** — 🔵 Headline number Fraunces 56 / 700. Per-service rows with bar visualisation.
- [x] **`MoodRoomPage`** — 🟠 Cover-story treatment lifted from For You. Big atmospheric hero; supporting grid below.
- [x] **`OnboardingFlow`** — 🔵 5-step state machine unchanged. Step screens adopt magazine layout (kicker + Fraunces title + body + primary CTA).
- [x] **`auth/*`** — 🔵 Reuse onboarding step layout for sign-in / sign-up.

## Phase 5 — Atomic content components

- [x] **`FeaturedHero`** — 🟠 Replace card-style auto-rotator with editorial magazine hero. No auto-rotate; user swipes.
- [x] **`MoodRoomsRow` / `MoodRoomCard`** — 🟠 New tile design (square-ish, room-accent gradient, Fraunces label).
- [x] **`ContentRow`** — 🔵 Wraps SectionHead. Card variants `default | wide | lead`.
- [x] **`LazyGenreSection`** — 🔵 Wrap with SectionHead. Inner row stays.
- [x] **`CategoryFilter`** — 🔵 Editorial chip bar with kicker.
- [x] **`SliderTray`** — 🔵 Restyle handles, tick labels in DM Sans 11 tracked.
- [x] **`FilterSheet` / `ReportSheet`** — 🔵 Sheet shell uses `--shadow-sheet` + grabber pill.
- [x] **`AnchorMoodRoomCard`** — 🟠 Lifts cover-story treatment.
- [x] **`EditorsNote`** *(new)* — 🟣 Collapsed strip + modal. Reads from `editor_notes` table.
- [x] **`MagazineHero`** *(new)* — 🟣 New primitive used by Home + ForYou + MoodRoom.
- [x] **`CalendarStrip`** *(new)* — 🟣 Horizontal scroll of upcoming dates with service marks.

## Phase 6 — Data / infra

- [x] **`editor_notes` table** — 🟣 Supabase migration. Columns: `id, body, kicker, published_at, expires_at`. Read once-per-day cached.
- [x] **`recommendations-v2/rows/home/perServiceChart.ts`** — 🟢 Existing logic, no change. Just verify Home wires it.

## Phase 6.5 — End-to-end review + on-device refinements (post-merge)

Landed via PR #7 (squash-merge `2dfc685`) and follow-up commits on main. These came out of an end-to-end visual review against the design reference plus on-device testing on Android.

### New components

- [x] **`TopAppBar`** *(new)* — 🟣 Wordmark banner. Lives at top of Home, scrolls with the page (not sticky). `padding-top: calc(env(safe-area-inset-top, 0px) + 20px)` symmetric with `padding-bottom: 20px`. No profile glyph (Profile tab in BottomNav).
- [x] **`LongRead`** *(new)* — 🟣 Editorial spotlight with cover image + Fraunces title overlay + DM Sans excerpt + byline kicker. Image is full-bleed; text below sits at the standard `px-5` gutter. Hardcoded sample copy pending IN-V3-001.
- [x] **`NumberedChart`** *(new)* — 🟣 Top-N row anatomy (rank numeral · thumb · title · service+meta · play tile). Reusable unranked: `numbered={false}` + `subtitleFor` for the For You watchlist preview ("Saved 2 days ago").
- [x] **`FreeTonight`** *(new)* — 🟣 Green-framed row of items free on the user's connected free services (BBC iPlayer / ITVX / Channel 4). Skipped when none are connected.
- [x] **`WideCard`** *(new)* — 🟣 Landscape (16:9) variant. Real TMDb backdrops via `backdrop_path` threaded through `contentAdapter`. Used by Critics' Picks on Home + Outside Your Usual on For You.
- [x] **`CalendarList`** *(new)* — 🟣 Date-grouped vertical list (TODAY / TOMORROW / WEEKDAY DD MMM). Replaces `CalendarStrip` on Home and For You. `CalendarStrip` deleted.
- [x] **`genreIcons`** *(new)* — 🟣 Emoji glyph mapping for genre/cluster surfaces.

### Anatomy refinements

- [x] **MagazineHero** — Kicker top-left in cream (was orange) so it doesn't compete with the brand mark; standfirst switched from Fraunces italic → DM Sans regular at 85% opacity. Top-right service badge full-bleed (no chip wrapper) with `--badge-glow` halo. CTA fallback to first-listed service when `userServices` filter empties. Full-bleed on mobile (no `editorial` padding, no `borderRadius`).
- [x] **ContentCard** — Service stack moved from chip to full-bleed badges with halo (TL). Bookmark TR uses `--scrim-glass-action` + `--scrim-glass-edge`. ★ rating BL is a dark glass pill (was plain text — washed out on bright posters).
- [x] **EditorsNote** — Square "A" mark (was pill), `--primary-soft` background + `--primary` letter (inverted so the mark reads as a badge, not a button). Body in Fraunces (was DM Sans). Chevron-right disclosure on the collapsed strip.
- [x] **WatchlistPage** — List view default. GridCard rebuilt to ContentCard anatomy (services TL halo, bookmark TR, rating pill BL, title beneath). List rows show service · IN YOUR PLAN chip · "saved X ago" · ★ rating · Play.
- [x] **FilterSheet** — Chip-pill restyle (tint pattern: `--primary-soft` bg + `--primary` text + 50%-mix border for active; transparent + hairline for inactive). Fraunces 28px rating numeral. Drop the inline `<style>` no-scrollbar block.
- [x] **ProfilePage** — Monochrome icon tiles (was saturated brand chiclets). Orange accent reserved for Your Taste row + Sign Out button. Delete row uses `--danger` token.
- [x] **CategoryFilter** — Tint-pattern chips. On Home, mounted statically (no sticky / no scroll-hide); the trailing filter button is suppressed by omitting `onFilterPress`.
- [x] **DetailPage** — Similar-row migrated to `<ContentCard variant="default">` (was a custom inline anatomy with white text overlaid on poster).
- [x] **ServiceBadge** — Fallback uses `var(--svc-*)` brand tokens (was `bg-gray-600`). `ServiceStack` outline removed so Disney+ / Prime brand colours run edge-to-edge with no dark ring.

### Tokens added

- [x] **`--scrim-glass-soft / --scrim-glass / --scrim-glass-action / --scrim-glass-edge`** — three opacity weights of the glass-blur scrim used over imagery, plus a hairline edge inset.
- [x] **`--badge-glow`** — service-mark halo (`drop-shadow`) used as a CSS `filter` on the wrapper around full-bleed `<ServiceBadge>`s.
- [x] **`--star`** — `#fbbf24` for the ★ glyph (was hard-coded across 5+ files).
- [x] **`--primary-foreground`** — already in tokens, now documented in §3.
- [x] **`[data-theme="light"] .t-kicker { color: #b8451a; }`** — light-mode kicker contrast bump (~5.4:1 vs paper).
- [x] **Type ramp** — `--t-body` 15 → 13px to match `--t-meta`'s tighter feel.
- [x] **`.editorial`** — switched `margin: 0 auto` shorthand to `margin-left/right: auto` longhand so per-element `mt-*`/`mb-*` Tailwind utilities aren't reset by the shorthand.

### Bottom-nav glyphs normalised

- [x] All five bottom-nav icons share a 4→20 (16×16) bbox so they read as the same visual size:
  - `HomeIcon` already 4→20 ✓
  - `SparkleIcon` (For You): grew from 5→19 to 2→18 / 4→20
  - `SearchIcon` (Browse): circle nudged to (10, 10) r=6, handle 15→20
  - `BookmarkIcon` (Watchlist): tightened from 5→21 (taller) to 4→20
  - `UserIcon` (Profile): body bottom from y=21 to y=20

### Pre-merge cleanup

- [x] Removed handover artifacts: `Videx A Long-form.html`, `Videx Portfolio.html`, `videx-design-system.html` (design now implemented).
- [x] Removed unused brand SVG variants: `videx-lockup-{dark,light}.svg`, `videx-mark-mono-{cream,ink}.svg`, `videx-icon-maskable.svg`. Kept `videx-mark.svg` (favicon).
- [x] Removed `src/index.css.bak-precompiled` (legacy backup).
- [x] Deleted unused `CalendarStrip` component (superseded by `CalendarList`).
- [x] Gitignore additions: `/.playwright-mcp/`, root `*.png`/`*.jpg`/`*.jpeg`.

### Parking-lot follow-ups

- **IN-V3-001** — Long Read editorial-spotlight data layer (`long_reads` table parallel to `editor_notes`).
- **IN-V3-002** — Taste-v2 surface for hero match% + per-title mood signals (currently hardcoded "✨ 96% match · Mood: contemplative" placeholder).
- **IN-V3-003** — Wire "Refine by feeling" mood refiner to taste-v2. UI is complete and hidden behind `MOOD_REFINER_ENABLED=false` flag in `ForYouPage.tsx`.

---

## How to ship a row

1. Create branch `redesign/<row-name>`.
2. Read `design-system.md` anatomy for the affected component(s).
3. Implement against real data (no demo state in committed code).
4. Verify at 390 × 844 in dark theme; spot-check light theme.
5. In the PR description, link the matrix row and embed a screenshot of the result next to the visual reference (`Videx Portfolio.html` capture).
6. Tick the row in this file as part of the PR.

## Definition of done (every row)

- All colours/fonts/radii/shadows come from tokens.
- No hard-coded hex, no inline `font-family`, no magic numbers for spacing.
- Component renders correctly in both `data-theme="dark"` and `data-theme="light"`.
- TypeScript clean, lints pass.
- Visual matches the reference at 390 width.
