# Videx — Design System

The contract for the 2026 editorial redesign. Tokens and components are the single source of truth — anything that consumes them inherits the new look. If you find yourself adding a value that isn't here, **stop and ask**.

> **Source of truth ranking:** this doc → `tokens.css` → `redesign-plan.md` → running app. When they disagree, fix the lower one.

---

## 1. Principles

1. **Editorial, not feed.** Every screen reads like a magazine page: kicker, title, standfirst, body. Variety beats density.
2. **One signal per element.** A card carries one rating, one bookmark, one platform mark. No competing badges.
3. **Type does the heavy lifting.** Fraunces (display) and DM Sans (UI) on a paper or ink surface. Decoration is rare.
4. **Mobile first, always.** Designs ship at 390 × 844. Desktop is a scaled-up read of the same layout.

## 2. Voice & tone

- **Kickers** are taxonomic, not promotional: *The Charts* / *Editor's Note* / *Free Tonight* / *In Your Mood*.
- **Titles** are short, declarative, sentence case for editorial content; title case for product chrome.
- **Standfirsts** are 1–2 italic Fraunces lines, written like magazine pull-quotes.
- Avoid hype words: "amazing", "exclusive", "must-watch". Avoid emoji.

---

## 3. Tokens

Tokens live in `src/index.css`. Full file: `tokens.css` (drop-in). Summary:

### Colour
| Role | Token | Light | Dark |
|---|---|---|---|
| Surface | `--surface` | `#f5f1e8` (paper) | `#0a0a0f` (ink) |
| Elevated | `--surface-elev` | `#ffffff` | `#14141c` |
| Hairline | `--hairline` | `rgba(20,20,28,0.10)` | `rgba(245,241,232,0.10)` |
| Foreground | `--fg` | `#14141c` | `#f5f1e8` (cream) |
| Soft fg | `--fg-soft` | 62% ink | 62% cream |
| Faint fg | `--fg-faint` | 40% ink | 40% cream |
| Brand | `--primary` | `#e85d25` | same |
| Brand foreground | `--primary-foreground` | `#ffffff` | `#ffffff` |

**Atmosphere accents** (6, used on mood rooms / atmospheric overlays only): amber `#d97706`, rose `#be185d`, teal `#0d9488`, violet `#7c3aed`, forest `#166534`, slate `#475569`.

**Service tints** (10): see `tokens.css`. Used inside `ServiceBadge` and per-service row kickers — never as page surfaces.

**Glass scrims** — dark-blur surfaces that sit on top of imagery (hero pills, top-right service badges, bookmark/info chips, ★ rating pills). Don't theme — same value in both modes.

| Role | Token | Value |
|---|---|---|
| Soft chip | `--scrim-glass-soft` | `rgba(20, 20, 28, 0.45)` |
| Label chip | `--scrim-glass` | `rgba(20, 20, 28, 0.55)` |
| Action button | `--scrim-glass-action` | `rgba(20, 20, 28, 0.78)` |
| Glass edge | `--scrim-glass-edge` | `0 0 0 0.5px rgba(255,255,255,0.10) inset` (`box-shadow`) |

Action-weight scrim (`--scrim-glass-action` + `--scrim-glass-edge`) is used on the hero CTA bookmark/info, the ContentCard top-right bookmark, and the ContentCard ★ rating pill. The hairline edge ships as an inset box-shadow so it doesn't add to layout.

**Service-badge halo** — `--badge-glow: drop-shadow(0 2px 6px rgba(0,0,0,0.45))`. Applied as a CSS `filter` on the wrapper around any `<ServiceBadge>` rendered over imagery (hero, ContentCard top-left, WideCard, WatchlistPage GridCard). Lifts the brand mark off the underlying poster without a chip background.

**Star** — `--star: #fbbf24`. Used wherever a ★ glyph renders alongside a numeric rating.

**Light-mode kicker override** — the brand `--primary` (`#e85d25`) hits 3.09:1 against the paper surface, below WCAG AA 4.5:1 for body text. The kicker (which is 11px tracked uppercase) carries a per-theme override `[data-theme="light"] .t-kicker { color: #b8451a; }` (~5.4:1 vs paper). The brand mark elsewhere keeps the original orange.

### Type

Variable-font `opsz` axis is part of the contract. Set `font-variation-settings: "opsz" N` proportional to size:

| Token | Size | Family / weight | opsz |
|---|---|---|---|
| `--t-display-1` | 64 | Fraunces 800 | 144 |
| `--t-display-2` | 44 | Fraunces 700 | 96 |
| `--t-headline` | 28 | Fraunces 600 | 48 |
| `--t-title` | 22 | Fraunces 700 | 36 |
| `--t-section` | 18 | Fraunces 600 | 24 |
| `--t-body` | 13 | DM Sans 400 | — |
| `--t-meta` | 13 | DM Sans 500 | — |
| `--t-kicker` | 11 | DM Sans 700 / 1.6px tracked / uppercase | — |

### Spacing & radii
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 80. Cards `--r-card: 12`, pills `--r-pill: 9999`.

### Motion
`--d-base: 220ms`, `--ease-out: cubic-bezier(0.16, 1, 0.30, 1)`. Hero crossfade 360ms; sheet entry 280ms with spring ease.

---

## 4. Components

Anatomies below match the React file in `src/components/`. Use them verbatim in new code.

### `<ContentCard>`
Poster card used in every horizontal row.

```
┌─────────────────────────┐
│                    [♡]  │   ← bookmark, top-right, 28×28
│                         │     glass blur, currentColor
│        POSTER           │
│       (2:3 fill)        │
│                         │
│ [★ 8.4]                 │   ← single rating pill, bottom-left
└─────────────────────────┘
TITLE                          ← DM Sans 14 / 600 / cream
2024 · Drama                   ← meta line, 12 / faint
```

**Removed from the old card:** plan/free pill, "new" ribbon, hover overlay. One rating, one bookmark, one platform stack on the title row beneath only when it's a per-service section.

Variants: `default` (160 wide), `wide` (220), `lead` (full-bleed 358), `mosaic` (used in mosaic grid only).

### `<ServiceBadge>` / `<ServiceStack>`
Single 24×24 square with the service's logo (assets in `src/assets/*.png`). Stack overlaps at -8px when there are 2+. Limit visible to 4; show `+N` for the rest.

### `<SectionHead>`
```
THE CHARTS                     ← kicker (orange, tracked)        [See all →]
Trending across your stack.    ← Fraunces 22 / 700 / opsz 36
What everyone's queueing →     ← optional standfirst, italic
```

Four-property contract: `kicker?`, `title`, `standfirst?`, `right?`. The `right` slot is a trailing affordance — typically a "See all →" link, filter chip, or count — sized so it sits opposite the kicker on the same row. Optional, but every horizontal row in §5 carries one in practice.

### `<MoodChip>`
Pill, 32 high, paper or ink-tinted background, 12 horizontal padding. Active state: filled with `--primary`, white text. Used on For You as a refiner above "In your mood".

### `<EditorsNote>` (collapsed → modal)
Default state is a single-line strip with the `A` mark + kicker + 1 sentence. Tap → modal sheet with full essay, drop cap on first letter, close button. Modal uses `--shadow-sheet` and slides up.

### `<MagazineHero>`
Full-bleed backdrop image with bottom gradient overlay. Kicker (orange tracked) → Fraunces 36 / 800 / opsz 96 title → 1-line standfirst → ServiceStack + meta line. No buttons; the whole hero is tappable.

### `<BottomNav>`
5 tabs: Home · For You · Browse · Watchlist · Profile. Fixed to viewport, blurred surface (`--surface-tint` + `backdrop-filter: blur(12px) saturate(180%)`). Active tab uses primary; inactive uses `--fg-faint`. Watchlist tab carries a small dot when there are unread releases.

### Sheets
Bottom sheets enter with translateY + spring. Top edge has a 36×4 grabber pill.

---

## 5. Screens (high-level)

### Home (7 sections, in order)
1. Magazine hero
2. Editor's Note (collapsed strip)
3. Recently added (mosaic, mixed grid)
4. The Charts (trending)
5. Editorial spotlight (single full-bleed)
6. New on each service (3 per-service rows)
7. Free tonight + Critics' Picks + Calendar strip

### For You (10 sections, in order)
1. Greeting + top pick (magazine hero variant)
2. Taste fingerprint (4 chips visualising your profile)
3. Mood chip refiner
4. In your mood (editorial mood section, refined by chips)
5. Cover-story mood room (1 featured + 3 supporting)
6. Continue exploring
7. Watchlist preview (3 items)
8. Outside your usual
9. Quick watch (under 30 min)
10. Calendar strip

Both surfaces share the same vertical rhythm: kicker + title break, full-bleed spotlight every ~3 rows, calendar strip at the foot.

---

## 6. Source files

| Artifact | Where | Use |
|---|---|---|
| Tokens | `src/index.css` | drop-in from `tokens.css` |
| Card primitives | `src/components/ContentCard.tsx`, `BrowseCard.tsx` | new anatomy |
| Section chrome | `src/components/SectionHead.tsx` *(new)* | wraps every row |
| Service badges | `src/components/ServiceBadge.tsx` | unchanged API, restyled |
| Editor's note | `src/components/EditorsNote.tsx` *(new)* | collapsed + modal |
| Bottom nav | `src/components/BottomNav.tsx` | restyle, no API change |
| Visual reference | `Videx Portfolio.html` (project) | screenshot at 390×844 |
