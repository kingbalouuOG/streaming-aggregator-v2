# Videx — Redesign rules for Claude Code

You are working inside the Videx codebase during the **2026 editorial redesign**. Read this file at the start of every session before touching UI code.

## What is happening

We are migrating the entire app from the original "card grid" UI to an **editorial magazine** direction (Direction A). It applies across every screen: Home, For You, Browse, Detail, Watchlist, Profile, Calendar, Spend, MoodRoom, Onboarding, Auth.

The visual contract is captured in two documents that you MUST read before writing UI code:

- `docs/v3-design/design-system.md` — tokens, type, color, components, anatomies. The source of truth for every visual decision.
- `docs/v3-design/redesign-plan.md` — per-component checklist with status (Unchanged / UI Update / Redesign / New) and definition of done.

If you are about to add a colour, font weight, radius, shadow, or component that is not in `design-system.md`, **stop and ask**. Do not invent tokens.

## Always do

- Use tokens from `src/index.css` (`var(--paper)`, `var(--ink)`, etc.). Never hard-code hex.
- Use `Fraunces` for display + editorial copy, `DM Sans` for UI. The variable-font `opsz` axis is part of the contract — set `font-variation-settings: "opsz" N` proportional to the size (see design system Type section).
- Use the new `<ContentCard>` anatomy: bookmark **top-right**, single rating pill **bottom-left**, no plan/free pill on cards.
- Wrap every horizontal row in a `<SectionHead>` with kicker (uppercase, tracked) + title (Fraunces) + optional standfirst.
- Honour the variety rule: never put more than two structurally identical rows back-to-back. Insert a spotlight, editor's note, chart strip, or per-service strip between them.
- Mobile-first. All screens are designed at **390 × 844 (iOS)**. Verify changes at that width.
- Keep dark theme as the default; light theme must work too. The accent (`#e85d25`) is the same in both.
- Apply tokens via `:root` / `[data-theme="dark"]`; do not branch on `theme` in components unless absolutely necessary.

## Never do

- Don't add gradients as a primary surface. Use them only for the magazine hero overlay (already specified).
- Don't add new icon libraries — extend `src/components/icons.tsx`.
- Don't introduce per-screen colour palettes. Atmosphere accents are a fixed set of 6, mood-tile accents are a fixed set of 10 (services). See design system.
- Don't add filler — extra rows, fake stats, decorative SVGs. Density is intentionally low.
- Don't ship a redesign PR that touches more than one matrix row. One row → one PR.

## How to work

1. Read the matrix row in `docs/v3-design/redesign-plan.md` for the component you're touching.
2. Open the corresponding anatomy in `docs/v3-design/design-system.md`.
3. Reference the visual mock at `docs/v3-design/Videx Portfolio.html` (Home + For You) when in doubt.
4. Implement against real data — do not commit demo data.
5. Update the matrix row's status from `[ ]` → `[x]` in the same PR.

## Source of truth

If `design-system.md` and any other doc disagree, `design-system.md` wins. If the design and the running app disagree, the design wins — fix the app.

## Reference assets in this project

When the design project (Stitch / artifact tree) is available, the canonical visual references are:

- `Videx Portfolio.html` — final Home + For You at 390×844 in iOS frames
- `Videx A Long-form.html` — full-length Home and For You scrollable
- `videx-design-system.html` — interactive design system

Treat the HTML as the visual reference; treat the markdown in `docs/` as the implementation contract.
