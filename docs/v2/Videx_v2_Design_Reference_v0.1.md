# Videx v2 — Design Reference v0.1

**Status:** v0.1 — Visual reference index for CC implementation work
**Version:** 0.1
**Date:** April 2026

---

## 1. Purpose

This document is a visual reference index for Claude Code (CC) to use when implementing v2 UI work. It maps implementation areas to image files that show how each surface should look.

**These are visual references only.** They show layout, structure, visual hierarchy, spacing, card patterns, and component arrangement. They are not the source of truth for:

- Features or functionality
- Copy or labels
- Specific content (titles, images, ratings, prices shown are all placeholder)
- Behaviour or interaction logic
- Edge cases or empty states

For all of the above, the locked v2 strategy documents are authoritative. CC should always cross-reference the relevant strategy document when implementing a screen, and use these images solely to understand the visual structure.

**Design system foundations** (colour tokens, typography, spacing scale, component conventions) are inherited from the existing v1 app and are not duplicated here. CC has access to these through the existing codebase.

**Where designs are absent**, CC has implementation discretion within the constraints set by the strategy documents. The "Not Interested" button on the detail page is one such case — see Section 5 below.

---

## 2. File location

All design reference images live in the project repository at:

```
docs/v2/design-references/
```

CC should reference these files by relative path when implementing the corresponding screens.

---

## 3. Index

### Bottom Navigation

**Files:**
- `Menu_BottomNav.png` — bottom nav component in isolation
- `Menu_iPhone_SE.png` — bottom nav in context on smaller screen
- `Menu_iPhone_16.png` — bottom nav in context on standard screen
- `Menu_iPhone_16_Pro_Max.png` — bottom nav in context on larger screen

**Use when:** implementing the bottom navigation bar, the active/inactive tab states, or testing how the nav scales across device sizes.

**Cross-reference:** Project Orchestration (no specific section — the bottom nav is global infrastructure).

---

### Onboarding Flow

**Files:**
- `V2_Onboarding_Step_1.png` — Step 1 of 5: account creation form, age range chips, viewing context selection
- `V2_Onboarding_Step_2.png` — Step 2 of 5: streaming service selection grid
- `V2_Onboarding_Step_3.png` — Step 3 of 5: watched-grid round selection (one round of three)
- `V2_Onboarding_Step_4.png` — Step 4 of 5: genre preference selection grid
- `V2_Onboarding_Step_5.png` — Step 5 of 5: taste summary and slider tuning

**Use when:** implementing any of the five onboarding steps. The progress indicator pattern, selection state styling, and primary CTA placement are all visible across the set.

**Cross-reference:** Recommendation Engine Strategy v1.6.2 Section 4 (onboarding signals); Implementation Notes Parking Lot v0.3.2 entries IN-OB-001 through IN-OB-005 (onboarding implementation notes).

---

### Home Surface

**File:**
- `Home.png` — Home surface full scroll view showing hero carousel, row layouts, card patterns, bottom nav

**Use when:** implementing the Home tab, the featured hero carousel, content row layouts, or card components.

**Cross-reference:** Home and For You Composition Hypothesis v0.3 Section 3.1 (Home surface row composition).

---

### For You Surface

**File:**
- `For_You.png` — For You surface full scroll view showing slider entry point, mood room cards (distinct from content cards), row layouts, bottom nav

**Use when:** implementing the For You tab, the slider entry point, the mood room card pattern, or any of the For You content rows.

**Cross-reference:** Home and For You Composition Hypothesis v0.3 Section 3.2 (For You surface row composition); Recommendation Engine Strategy v1.6.2 Section 5.2 (mood rooms execution).

---

### Profile Area

**Files:**
- `V2_Profile_Profile_Page.png` — Profile landing page with avatar, stats summary, and action rows
- `V2_Profile_Account_details.png` — Account Details sub-page (editable name and email)
- `V2_Profile_Streaming_services.png` — Streaming Services sub-page with connection toggles
- `V2_Profile_Spend_analysis_1.png` — Monthly Spend sub-page in default collapsed state
- `V2_Profile_Spend_analysis_2.png` — Monthly Spend sub-page with a service tier selector expanded
- `V2_Profile_Your_taste_1.png` — Your Taste sub-page default state with genre chips
- `V2_Profile_Your_taste_2.png` — Refine Preferences screen (genre selection grid)
- `V2_Profile_Your_taste_3.png` — Your Taste with retake confirmation modal overlay
- `V2_Profile_Recommendations.png` — Tune Your Recommendations sub-page with the four sliders
- `V2_Profile_Appearance.png` — Appearance sub-page (theme selection)
- `V2_Profile_Privacy___data_1.png` — Privacy & Data sub-page in default state
- `V2_Profile_Privacy___data_2.png` — Privacy & Data with "What Videx learns about you" modal overlay
- `V2_Profile_Privacy___data_3.png` — Privacy & Data with delete account confirmation modal overlay

**Use when:** implementing any part of the Profile area, including the landing page, any of the sub-pages, or the modal overlays for confirmations and informational pop-ups. The sliders shown in `V2_Profile_Recommendations.png` are the same component used in onboarding Step 5 and in the For You "Tune your recommendations" entry point — see Sliders below.

**Cross-reference:** Implementation Notes Parking Lot v0.3.2 entries on the Profile restructure; Recommendation Engine Strategy v1.6.2 Section 5.2 (slider parameter mapping).

---

### Sliders

The slider component appears in three locations:

1. **Onboarding Step 5** — see `V2_Onboarding_Step_5.png`
2. **Profile Tune Recommendations sub-page** — see `V2_Profile_Recommendations.png`
3. **For You modal/tray** (entry point visible at the top of `For_You.png`)

**Use when:** implementing the slider component itself or any of the three locations where it appears. The visual treatment should be consistent across all three.

**Cross-reference:** Recommendation Engine Strategy v1.6.2 Section 5.2; Home and For You Composition Hypothesis v0.3 Section 3.2.

---

## 4. Cross-references to phases

For convenience, here is which design reference applies to which v2 implementation phase:

- **Phase 0** — Bottom Navigation, Detail Page (no design provided — see Section 5)
- **Phase 3** — Onboarding Flow (all 5 steps), Profile Area (all sub-pages and modals), Sliders
- **Phase 4** — Home Surface, For You Surface, Sliders (parameter wiring)
- **Phase 4.5** — For You Surface (mood room card pattern)

CC working on a given phase should pull the relevant images from `docs/v2/design-references/` at the start of implementation work and refer to them throughout.

---

## 5. Areas without design references

### Detail Page "Not Interested" button

There is no design reference for the "Not Interested" button on the detail page. CC has implementation discretion within these constraints (see Detail Page Signal Capture Spec v0.3.2 Section 2.7):

- Secondary to the existing thumbs up / thumbs down actions — must not compete visually with them
- Discoverable but unobtrusive
- Placement should feel natural alongside the existing detail page action row
- A small icon button or similar pattern is appropriate; an overflow menu item is also acceptable

CC should implement this in a way that fits the existing detail page layout from the v1 codebase. The detail page UI shell is otherwise unchanged in v2.

---

## 6. What this document does not cover

- Design system foundations (colour tokens, typography, spacing) — inherited from v1
- Detail page UI shell — inherited from v1
- Browse, Watchlist, and other surfaces unchanged from v1
- Empty states, error states, loading states (CC implementation discretion based on existing v1 patterns)
- Animation and transition specifications
- Accessibility-specific visual treatments (focus rings, high-contrast mode)
- Future v2.5 designs

---

*End of Design Reference v0.1. To be updated when additional designs are produced for surfaces or components not currently covered.*
