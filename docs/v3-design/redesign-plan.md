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

- [ ] **`editor_notes` table** — 🟣 Supabase migration. Columns: `id, body, kicker, published_at, expires_at`. Read once-per-day cached.
- [ ] **`recommendations-v2/rows/home/perServiceChart.ts`** — 🟢 Existing logic, no change. Just verify Home wires it.

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
