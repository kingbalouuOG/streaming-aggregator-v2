# Videx — Services & channels picker (Direction B) · design handoff

**Source:** Joe, 2026-09-15 — Claude Design output for `docs/strategy/briefs/service-picker-design-brief.md` (IN-SC-006). The reference artboards (`Videx Services & Channels — Direction B.html`, 390×844 frames) live outside the repo; this README is the implementation spec. Decisions taken after hand-off are at the end and override the text above them.

Reference designs: `Videx Services & Channels — Direction B.html` (open in a browser; artboards are 390×844 iPhone frames). Design system: `design_handoff_videx/tokens.css`. These are UI references only — implement in `native/src/components/services/ServicePicker.tsx` (shared by onboarding step 2 and Profile → Streaming Services), the Profile row, and `WhereToWatch.tsx`.

## Model (unchanged, must be respected)
- A channel is held once, however bought (Hayu via Prime = Hayu via NOW pass).
- HBO Max, Paramount+, discovery+, Crunchyroll, MUBI are both service tiles and channels. One selection: toggling the channel row toggles the tile and vice versa.
- Other channels (Shudder, MGM+…) only count when the parent (Prime / Apple / NOW) is also selected.
- NOW behaves like Prime and Apple; call its channels "passes".
- Channel list is remote data (0–20 per parent, names 3–22 chars) and may fail to load.

## Components

### Service tile (existing, minor changes)
- 2-col grid, gap 10, radius 12, `bg-card`, border cream 10%. Selected: border `#e85d25`, fill orange 14%.
- Badge 40 (was 48) so names never truncate; name 13/700 cream wraps to 2 lines; description 11 muted, single line ellipsis.
- Grid `alignItems: start` — a parent tile with a strip is taller than its neighbour; that is intended.
- Copy: Prime / Apple description "Originals & channels"; NOW "Cinema, Entertainment & Hayu passes".

### Channel strip (new) — inside a selected parent tile
- Full tile width, min height 44, top hairline orange 42%, background `#0a0a0f` at 35% over the tile tint.
- Left: 12/600 cream summary, ellipsis. Right: 11/600 + 12px chevron.
- Nothing held: "Any channels inside?" · right "Choose ›" in orange.
- Held: names joined by ", " · right "2 channels" muted (singular "1 channel" / "1 pass").
- Failed: "Channels unavailable" faint · right "Retry" orange.
- Whole strip is the tap target. Accessibility label: "Prime Video channels, 2 held, button".

### Channel sheet (new) — one per parent
- Bottom sheet 640pt, `#111118`, top radius 20, grabber 36×4 at 20% cream, backdrop black 55%. Open/close 250ms ease-snap.
- Header: 38px parent badge · kicker "INSIDE PRIME VIDEO" (11/700, tracking 1.6, orange) · Fraunces 20/700 "Which channels have you added?" · helper 12 muted: "Bought separately inside the Prime Video app. Skip if you're not sure — most people have none."
- Rows: min 52pt, hairline between, 12pt horizontal padding.
  - Standard channel: 28px monogram square (`bg-soft`, Fraunces 13/700 first letter) · name 14/600 · meta 11 faint "301 titles only here" (count of catalogue titles exclusive to the channel). **→ dropped, see decisions.**
  - Duplicate channel: 28px service badge · name · meta "Also a service · one tick counts everywhere".
  - 22px check circle, orange filled with tick when held.
- Order: titles unlocked, descending. **→ registry order, see decisions.**
- Footer CTA 52pt orange radius 14 over a gradient: "Done · 2 channels" / "None of these" (nothing held) / "Close" (failed).
- Failed state: replace list with a card "Couldn't load channels — Your Prime Video pick is saved. Try again in a moment." + outlined Retry pill.
- Done, swipe-down and backdrop tap all commit ticks to the picker's local state (no cancel). Row accessibility label: "Shudder, channel in Prime Video, selected".

## Screens

### Onboarding step 2
- Header unchanged apart from meta under the title: "Tick what you pay for. 3 selected." Continue meta: "3 services · 2 channels" / "Select at least one service to continue".
- Selecting a parent adds the strip only; nothing opens automatically.
- Saves at the end of the flow, as today.

### Profile → Streaming Services
- Sub-screen header subtitle: "5 services · 2 channels" (omit channels when 0).
- Save disabled until dirty; label "Save changes" when dirty.
- On save, replace the CTA in place with a confirmation card (card bg, cream 10% border, filled check): title "Saved", body "We'll include BFI Player titles in For You — within 20 minutes, or pull to refresh." Name the channels added in this save; if only removed, "Your services are up to date."

### Profile row
- "Streaming Services" · subtitle "5 services · 3 channels" · badge stack of up to 4 services (22px, −7 overlap) · chevron.
- Monthly spend subtitle appends "· services only" (channel pricing out of scope).

### Where to Watch
- Held channel joins **On your stack**: orange row, badge = parent service, "Watch on Shudder", sub "via Prime Video · a channel you hold", external-link glyph in orange.
- Unheld channel stays under **Via a channel**: "Curzon", sub "on Prime Video", right an outlined pill "I have this" (min 32pt, 12/600) — shown only when the user holds the parent. Footnote unchanged.
- Tapping "I have this": save immediately, move the row into On your stack with sub "via Prime Video · just added", show a top toast "Curzon added inside Prime Video. For You will include it." with Undo.

## Edge cases
- Long names (e.g. "STUDIOCANAL Presents") never truncate in the sheet; the strip may ellipsise.
- A parent with one channel shows a one-row sheet; nothing else changes.
- Channel list failure never blocks selecting or saving the parent service.

## Assets
Service logos in `assets/` (netflix, prime, apple, disney, bbc, itvx, channel4, now, skygo, paramount, hbo, plutotv, discovery, crunchyroll, mubi). Channels without a logo use the monogram.

---

## Decisions after hand-off (Joe, 2026-09-15)

| Question | Decision |
|---|---|
| "301 titles only here" meta and sort by titles unlocked | **Dropped.** Rows show the channel name only, in registry order. No migration. The duplicate-channel line ("Also a service · one tick counts everywhere") stays — it explains the shared toggle, not a count. |
| Profile save: README card vs the p-5 artboard's toast on Profile home | **Card, stay on screen.** No toast on Profile home; the user leaves with Back. |
| "I have this" on a channel that is also a service (e.g. HBO Max via Prime) | **Adds the service.** Toast "HBO Max added to your services. For You will include it." with Undo. |
| Where to build | This session, branch `feat/service-picker-direction-b`. |

Implementation notes: the sheet uses React Native core `Animated` + `PanResponder` (no `GestureHandlerRootView` is mounted in the app), so the whole change is JS-only and can ship as an OTA update.
