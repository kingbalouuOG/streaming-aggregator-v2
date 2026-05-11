# Phase Search V2 — Implementation Brief

**For:** Claude Code (frontend implementation)
**Status:** Design approved — 2026-05-11
**Scope:** Search/Browse tab only. Home and For You unaffected.
**Design source of truth:** `Videx Search V2.html` (6 artboards) + `src/components/` design-system primitives. **Do not introduce new tokens, components or colours** — every value comes from `src/index.css` and existing primitives.

---

## 1. What we're building

Phase 1 of Search v2 — filtered + semantic search behind a backend flag. Cluster A (filters) ships unflagged; Cluster B (semantic) UI affordances ship in the same release but the backend mode is gated until eval-green.

Five surfaces + one supporting state to implement:

| # | Surface | Notes |
|---|---|---|
| 01 | Search empty state | Two parallel journeys (filter CTA + mood chips), recents list |
| 02 | As-you-type | Suggestions list, kept-frame transition |
| 02b | Micro-states | `tooShort`, `loading` — share the typing shell |
| 03 | Results — Mode A (lookup) | Literal-match results |
| 04 | Results — Mode C (semantic) | Same shell, indicator changes, revert affordance |
| 04b | Mode C opt-in moment | Full-width CTA when Mode A returns nothing useful |
| 05 | FilterSheet | Full multi-param custom search — scroll layout, all axes in one sheet |
| 06 | Results — filters active | Active-filter chip strip + count + edit shortcut |

---

## 2. UX principles (read these before writing code)

1. **Two parallel journeys, equal weight.** The empty state offers *search-by-typing* (mood chips fire semantic queries) and *search-by-filter* (CTA opens FilterSheet directly). Don't bury either. The orange CTA card is intentionally heavier than the mood chips because filter-driven discovery is the larger product surface — users who know what they're feeling tap a mood; users who don't tap "Browse by filter".

2. **One signal per element.** Cards never carry competing badges. Bottom-right pill shows *either* a rating *or* "Not on yours" — never both.

3. **Editorial, not feed.** Kickers are taxonomic and uppercase ("RECENT", "OR START WITH A FEELING", "7 FILTERS"). Standfirsts stay reserved for editorial content — search chrome doesn't get them. Mode indicator copy is conversational ("Showing titles like '…'") not technical ("Semantic search results for…").

4. **All services default ON.** Filter sheet opens with every service the user subscribes to pre-selected. They opt *out*, they don't opt in.

5. **Filter state survives navigation.** Active filters persist as long as the user stays on the search surface — clearing happens only via the chip × buttons or "Clear" action.

6. **Mode C is invisible until it matters.** Mode A is the default. Mode C engages only when (a) Mode A returns a sparse/empty result for a free-text query, in which case the opt-in CTA renders above the (empty/sparse) grid, or (b) the user taps a mood chip on the empty state.

---

## 3. Surface-by-surface implementation notes

### 3.1 Empty state (artboard 01)

**Composition (top → bottom):**
1. Search input (existing `<SearchInput>`), pinned.
2. `RECENT` section — `<SectionHead kicker="Recent" rightSlot={<ClearButton/>}/>`, then up to 5 rows. Each row: clock icon (faint), query text, × dismiss button. Tap row → submit that query and go to results. Tap × → remove from history. Hide the entire section if the user has zero recents.
3. **"Browse by filter" CTA** — full-width orange button, Fraunces 19 title, 12px subtitle. Tap → open FilterSheet (artboard 05) with all services pre-selected, no other filters set.
4. `OR START WITH A FEELING` section — `<SectionHead>` with kicker + sub. 2×2 grid of `<MoodChip>`. Tap → populate search input with the mood phrase, submit, render Mode C results.

**Out of scope:** trending searches, decade chips, service chips as quick-access. (Decades + services are in the FilterSheet, never duplicated here.)

### 3.2 As-you-type (artboard 02)

**Trigger:** ≥ 2 chars, debounce 200ms.

**Composition:**
- Search input with × clear affordance.
- Suggestions list under the input — up to 5 rows. Each row: 40×60 poster, title (DM Sans 14 600), meta (year + type, DM Sans 11 500 faint), service stack.
- Tap behaviour: if the row is a high-confidence exact title match (score ≥ threshold tbd), route directly to the detail page. Otherwise route to the results page filtered to that title. **Threshold decision is open — confirm with Joe before implementing.**

**Micro-states (artboard 02b):**
- `tooShort` — single char typed. Show centred message "Keep typing…" with the recents list still visible underneath (keep-frame, don't blank the page).
- `loading` — show suggestion skeletons (5 rows of poster + title placeholders).

### 3.3 Mode A results (artboard 03)

**Composition:**
- Search input (shows current query).
- Category pills: All / Movies / TV. Existing `<CategoryPills>`.
- Mode indicator row: `Results for "<query>"` — DM Sans 13 `--fg-soft`. Filter button on the right with count badge when ≥ 1 filter active.
- 2-col grid of `<ContentCard>`.

**ContentCard composition (matches app-wide pattern):**
- Top-left: `<ServiceStack size={18} max={3}>` overlay on a glass-blur pill.
- Top-right: bookmark button (28×28) in a glass-blur pill. Filled state when saved.
- Bottom-right: rating pill `★ N.N` OR "Not on yours" pill (never both).
- Below poster: title (Fraunces 14.5 600, 2-line clamp) + year (DM Sans 11 500 faint).

**Off-services cards:** if the on-services filter is OFF, off-services results render with `opacity: 0.75` and the "Not on yours" pill replacing the rating pill. Tap still routes to detail.

**No-results state:** copy = "Nothing matches this combination. Loosen a filter?" + a suggested-loosen action when possible (drop the most restrictive filter).

### 3.4 Mode C results (artboard 04)

Same shell as Mode A. Differences:

- Mode indicator copy: `Showing titles like "<query>"` — italic Fraunces 13 `--fg-soft`.
- Revert affordance directly below indicator: `← Search keywords instead` link. Tap → re-runs the query as Mode A.
- Results grid identical to Mode A.
- **No `match: N%` pill on cards in production.** Debug-only.

### 3.5 Mode C opt-in (artboard 04b)

When Mode A returns 0–2 results for a free-text query, render a full-width CTA above the (sparse) grid:

```
Search for "<query>" as a description
```

Apply the `--scrim-glass-action` + `--scrim-glass-edge` treatment. Tap → re-runs as Mode C.

### 3.6 FilterSheet (artboard 05) — **confirmed scroll layout**

Bottom sheet, 740px height, grabber pill at top edge, existing entry transition (280ms spring).

**Header:**
- Kicker `REFINE` + Fraunces 24 title "Filters" + count badge ("7" when 7 filters are active).
- × close on the right.

**Sections in this order (scroll inside the sheet):**

1. **Only on my services** (toggle row, defaults ON) — pinned at top. Sub-copy: "Hide titles not in your stack."
2. **STREAMING SERVICES** — "Your services" / "All on by default — tap to exclude." Horizontally-scrolling row of service tiles (56×56 logo, orange ring + tick badge when active, greyscale + faded when excluded). All user services selected by default.
3. **CONTENT TYPE** — "Movies, TV or docs?" Segmented control: All / Movies / TV / Docs. Single-select.
4. **COST** — "Free, in-plan or rent OK?" Segmented: All / Free / In plan / Rent OK. Single-select.
5. **RUNTIME** *(new axis)* — "How much time tonight?" Segmented: Any / Under 60 / 60–120 / 120+. Single-select.
6. **GENRE** — "Pick one or more." 18 chip multi-select.
7. **DECADE** *(new axis)* — "When was it made?" 7 chips multi-select: 1960s / 70s / 80s / 90s / 00s / 10s / 20s.
8. **UK RATING** *(new axis)* — "Content rating." Chip multi-select: U / PG / 12 / 12A / 15 / 18 / TV-14 / TV-MA. **Confirm exact set against `titles.content_rating` distinct values before shipping.**
9. **MINIMUM RATING** — "Critic + audience." Slider 0–10, step 0.1. Value display: large Fraunces orange "6.8+" when set, "Any" when 0. Existing slider behaviour.
10. **SHOW WATCHED** — "Already-watched titles." Existing dropdown row.
11. **LANGUAGE** — "Original language." Help-text: "None selected = show all." 10-chip multi-select.

**Footer:**
- Clear all (ghost, left) + Apply (primary orange, right). Apply closes the sheet and re-runs the query.

**Active-filter affordance outside the sheet:** the filter button on the results page header gains a count badge ("Filters · 3") when ≥ 1 filter is active. Tapping it opens the sheet scrolled to show the active-set sections first.

### 3.7 Results with active filters (artboard 06)

Composition above the results grid:

1. Search input (or, if no text query, placeholder "All titles matching your filters").
2. Kicker row: `7 FILTERS · CLEAR` (Clear is uppercase-tracked text button, drops every filter).
3. Horizontally-scrolling chip strip — one pill per active filter. Each pill: label + × to drop just that filter. Pill colour = `--primary-soft` background, `--primary-edge` border, `#ff8d5a` text.
4. Thin divider.
5. Result count row: "**34 titles** match all 7 filters" — bold cream count + faint trailing text. Right side: "Edit filters" shortcut button (primary-soft pill with sliders icon).
6. 2-col `<ContentCard>` grid.

---

## 4. Component reuse map

| Surface element | Component | Status |
|---|---|---|
| Search input | `<SearchInput>` | existing |
| Section header | `<SectionHead kicker title sub rightSlot>` | existing |
| Mood card | `<MoodChip icon label sub hue>` | existing |
| Content card | `<ContentCard>` | **modify** — add top-left service stack overlay + top-right bookmark to the existing component |
| Service badge | `<ServiceBadge>`, `<ServiceStack>` | existing |
| Bottom sheet | existing sheet primitive | existing |
| Toggle row | existing | existing |
| Segmented control | existing | existing |
| Filter chip (multi-select) | `<MoodChip variant="chip">` (small variant) | existing |
| Slider | existing | existing |
| Service tile (filter sheet logo button) | **new** — `<ServiceTile>` | new primitive — 56×56 logo, active ring + tick badge, greyscale-when-inactive |
| Active filter pill | **new** — `<ActiveFilterPill label onRemove>` | new primitive — small pill with × |
| Bottom nav | `<BottomNav>` | existing |

Only two new primitives. Everything else composes existing components.

---

## 5. Interaction + state details

- **Recent searches:** persist in local storage, max 20 entries, surface most-recent 5 on the empty state. Dedupe by exact match.
- **Filter state:** keep in URL query params (`?services=netflix,apple&type=movie&genre=drama,thriller&runtime=60-120&decade=70s,80s&rating=15,18&min=6.8&lang=en,ko`) so deep links work and the back button restores state.
- **Debounce:** 200ms on typing → suggestions; 300ms on filter changes → re-query.
- **Skeletons:** suggestion rows + result cards. No spinners except in `loading` micro-state.
- **Sheet entry:** 280ms with `cubic-bezier(0.16, 1, 0.30, 1)` (existing `--ease-out`).
- **Sheet dismiss:** swipe-down on grabber, tap backdrop, or × button — all close without applying (Apply is the explicit commit).

---

## 6. Open questions for product

1. **Suggestion tap routing threshold** — what title-match score routes straight to detail vs results-page-filtered-to-title?
2. **UK content rating set** — confirm against `titles.content_rating` distinct values.
3. **Match-% on Mode C cards** — keep debug-only, or surface in production?
4. **Mode C trigger threshold** — how few Mode A results constitute "sparse" enough to render the opt-in CTA?

---

## 7. Out of scope (do not implement)

- Entity search (Phase 2).
- Search-as-signal (Phase 3).
- Voice search.
- Search-feature onboarding tour.
- In-app toggle for semantic mode (backend flag only).
- Trending searches.
- Search history syncing beyond local storage.
