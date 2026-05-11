# Phase Search V2 — Design Brief (for Claude Design)

**Status:** Brief v0.1 (2026-05-11) — pending Joe's approval before design work begins.
**Strategy source:** `videx-wiki/raw/v2-strategy/Videx_v2_Search_Strategy_Annex_v0.1.md`.
**Implementation brief (parallel):** `docs/v2/Phase_Search_V2_Kickoff.md`.
**Design system source of truth:** `docs/v3-design/design-system.md` and `src/index.css` tokens. **Read both before sketching anything.**

---

## 1. What we're designing

UI work for Phase 1 of search v2 — filtered + semantic search shipped behind a feature flag. Cluster A (filters) is unflagged. Cluster B (semantic) is flagged off until eval green but the UI affordances need to ship in the same release so the flag flip is purely a backend toggle.

Five surfaces / states need design:

1. **Search tab empty state** (no query yet)
2. **Search tab as-you-type state** (query in flight)
3. **Search results page — Mode A (lookup)**
4. **Search results page — Mode C (semantic)** — same page, with mode indicator + revert affordance
5. **FilterSheet — expanded with four new axes** (runtime, year/decade, content_rating, on-services toggle)

---

## 2. Hard constraints

- **Mobile first, 390 × 844.** Capacitor app — no desktop scaling concerns inside this phase.
- **Editorial, not feed.** Read `docs/v3-design/design-system.md` §1 (Principles) and §2 (Voice & tone) before drafting copy. "The Charts" not "Trending Now".
- **One signal per element.** No competing badges on cards.
- **Tokens are the contract.** No new colours, no new font sizes, no new spacing values. Everything in `src/index.css`. If something feels missing, raise it before adding.
- **Type does the heavy lifting.** Fraunces (display, opsz axis) for editorial; DM Sans for UI. Never invert.
- **Component primitives in use:** `<ContentCard>`, `<ServiceBadge>`, `<ServiceStack>`, `<SectionHead>`, `<MoodChip>`, `<EditorsNote>`, `<MagazineHero>`, `<BottomNav>`, sheets. Reuse these rather than inventing parallels.

---

## 3. Surfaces in detail

### 3.1 Search tab empty state

The user opened Search but hasn't typed anything yet.

**Existing baseline:** `BrowsePage.tsx` lines 219–278 — currently shows an editor's-note strip + 6 quick-start chips (Slow burn / Comedy / Crime / Sci-fi / Romance / Documentary). This is fine as a starting point.

**What to design:**
- Search input pinned to top (existing).
- Below: "Recent searches" section if the user has any (max 5, dismissible per-item). Section uses `<SectionHead>` with kicker "RECENT" and no standfirst.
- Below: entry-point chips. Same `<MoodChip>` component. Group by category if it doesn't bloat the page — moods, decades, services. Exact taxonomy is open (see Open Questions).
- The existing editor's-note strip stays at the top if Joe wants it; design a version without if he doesn't (raise both to him).

**What NOT to design:** "Trending searches". Won't have meaningful fleet data for ages — defer.

### 3.2 As-you-type state

User has started typing. ≥ 2 chars triggers debounced search.

**What to design:**
- The transition from empty state to results — don't blank the page on first keystroke. Skeletons or kept-frame.
- The "tooShort" state (1 char typed). Existing copy: "Keep typing…". Stays.
- Loading state. Existing copy / spinner. Probably stays.
- Inline title suggestions list — top 5 results render under the search bar as the user types, before they hit submit. Each row: poster thumbnail (40 × 60), title, year + media-type meta. Tap → results page filtered to that title (or detail page directly if exact match — design call). This is new.

### 3.3 Results page — Mode A (lookup)

User submitted a query, results came back from TMDb + Postgres availability filter.

**What to design:**
- Existing baseline: `BrowsePage.tsx` lines 281–327 — category pills (All / Movies / TV) + filter button + grid of cards.
- The category pills remain. The filter button gets a count badge when filters are active (e.g., "Filters · 3").
- The mode indicator strip sits above the grid: "Results for '<query>'" — single line, DM Sans 13, `--fg-soft`. Cluster A renders this, Cluster B replaces text when semantic mode is active.
- Results grid uses existing `<ContentCard>` primitive at `default` (160w) variant. Two-column on mobile (existing).
- "Not on your services" affordance — if the on-services filter is OFF, off-services cards render with a subtle "Not on your services" pill on the bottom-right (replace the rating pill? Or sit alongside? Design call). If on-services filter is ON, these are simply absent.
- No-results state — keep existing copy or rewrite ("Nothing matches this combination. Loosen a filter?"). Suggest a filter to loosen if possible.

### 3.4 Results page — Mode C (semantic)

Same page structure as Mode A. The differences:

**What to design:**
- Mode indicator copy changes: "Showing titles like '<query>'" — italic Fraunces 13 (or DM Sans 13 italic — design call), `--fg-soft`. Distinguishable at a glance from the literal "Results for".
- A small revert affordance — "Search keywords instead →" link below the indicator. Tapping reverts to Mode A for the same query.
- The "Search for '<query>' as a description" button on submit-when-no-strong-title-match — this is the moment the user opts into Mode C. Sits as a single full-width button above the (empty or sparse) Mode A results when Mode A returns nothing useful. Use the action-weight scrim pattern (`--scrim-glass-action` + `--scrim-glass-edge`) if rendered over imagery; otherwise paper / ink surface.
- Results grid is the same primitive. Cards may show a "match: {N}%" pill in some debug mode but NOT in production — confirm before adding.

### 3.5 FilterSheet — four new axes

Existing FilterSheet at `src/components/FilterSheet.tsx`. Bottom sheet pattern (existing). Top edge has a 36×4 grabber pill (existing).

**What to design:**

The sheet currently exposes: services, contentType, cost, genres, minRating, languages, showWatched. Adding four:

- **Runtime band.** Segmented control (any / under 60 min / 60–120 / 120+). Single-select. Sits below the existing minRating slider.
- **Year / decade.** Decade chip multi-select (`<MoodChip>` style — 1960s / 70s / 80s / 90s / 00s / 10s / 20s). Multi-select because users often want a span.
- **UK content rating.** Chip multi-select (`<MoodChip>` style — U / PG / 12 / 12A / 15 / 18 / TV-14 / TV-MA — confirm exact set against `titles.content_rating` distinct values). Multi-select.
- **On my services toggle.** Boolean toggle, defaults ON. Above all the granular axes — this is the most-used filter and should be reachable without scrolling.

The sheet is going to grow. Design a vertical scroll inside the sheet (existing pattern) or split into two tabs (Quick filters / Advanced) — bring both options to Joe. Lean toward scroll if total content fits in ~1.5 viewports; tabs if longer.

**Active-filter affordance** outside the sheet: filter button in results page header gains a count badge when ≥ 1 filter is active. Tapping the button while filters are active should default to showing the active set first (collapsed sections of unset filters below).

---

## 4. Tokens and primitives — quick reference

Pulled from `docs/v3-design/design-system.md`. Do not deviate.

- **Surfaces:** `--surface` (paper light / ink dark), `--surface-elev` (cards, sheets).
- **Foreground:** `--fg`, `--fg-soft` (62%), `--fg-faint` (40%).
- **Brand:** `--primary` `#e85d25` (light-mode kicker override `#b8451a` for AA).
- **Type sizes:** `--t-display-1/2`, `--t-headline`, `--t-title`, `--t-section`, `--t-body` (13 DM Sans), `--t-meta` (13 DM Sans 500), `--t-kicker` (11 DM Sans 700 tracked uppercase).
- **Spacing scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 80.
- **Radii:** `--r-card: 12`, `--r-pill: 9999`.
- **Motion:** `--d-base: 220ms`, `--ease-out: cubic-bezier(0.16, 1, 0.30, 1)`. Sheet entry 280ms with spring ease.
- **Glass scrims:** `--scrim-glass-soft`, `--scrim-glass`, `--scrim-glass-action` for action-weight.
- **Components:** `<ContentCard>`, `<MoodChip>`, `<SectionHead>` (kicker / title / standfirst / right-slot), bottom sheets with grabber.

---

## 5. Voice & copy

Per design-system.md §2:

- Kickers are taxonomic, uppercase tracked: "RECENT", "RESULTS", "FILTERED RESULTS".
- Titles short, declarative, sentence case for editorial (search results are product chrome — title case where it's chrome, sentence case where it's editorial).
- Standfirsts italic Fraunces, magazine pull-quote tone. Don't standfirst search results — it's chrome.
- Avoid hype words ("amazing", "exclusive", "must-watch"). Avoid emoji.
- Mode indicator copy is editorial in tone. "Showing titles like 'slow burn psychological thrillers'" — not "Semantic search results for…".

---

## 6. Deliverables

For each of the five surfaces in §3, deliver:

1. **Static mockup** at 390 × 844. PNG or Figma frame.
2. **Token annotations** — call out which token each colour / type / spacing value comes from. If something requires a token that doesn't exist, list it as a question, do not invent.
3. **Interaction notes** — transitions, loading states, empty / error / no-results variants.
4. **Component reuse callout** — for each composed element, state which existing component it's built from, or flag as new.

For the FilterSheet specifically, deliver both options (scroll vs split) so Joe can pick.

Place outputs in `docs/v2/design-references/search-v2/` (create the folder).

---

## 7. Non-deliverables (out of scope)

- Phase 2 (entity search) UI. Lives in forward-planning. Don't sketch a "More from Greta Gerwig" page.
- Phase 3 (search-as-signal) UI. Same.
- Search history syncing UI beyond "Recent searches" empty-state row.
- Voice search.
- Onboarding for the search feature itself — no first-time-user tour.
- Settings page for semantic toggle. The flag is backend-only in Phase 1; user has no in-app control.

---

## 8. Open questions for Joe

1. Empty-state taxonomy: stick with the existing 6 chips (moods only) or expand to grouped categories (moods + decades + services)?
2. Editor's-note strip on search empty state — keep or drop?
3. Inline as-you-type suggestions — tap-to-detail-page on exact match, or always tap-to-results-page?
4. "Not on your services" cards — show with pill, or hide entirely when on-services filter is OFF? (Annex recommends show-with-pill; needs UX confirmation.)
5. Mode C revert affordance — link below indicator, or icon button? Or both?
6. FilterSheet layout — scroll vs Quick/Advanced tabs? (Bring both options.)
7. Search tab rename — Browse → Search? Cosmetic, design-system implication only.
8. "match: N%" pill on semantic results — debug only or show in production? Recommend debug only.
