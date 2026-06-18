# NATIVE-4 Implementation Plan — Profile & Settings

**Status:** Active (Joe pre-approved while out: "next phase can begin"; review on return).
**Branch:** `phase-native-4-profile-settings` (stacked on NATIVE-3.5; PRs into `native-integration`).
**Trigger:** Joe can't sign out (no Profile screen) — blocks re-onboarding + the Step 4 glyph re-test. Design target: `Pictures\Videx\V2 Profile\*.png`.

## Scope

The web Profile (`ProfilePage.tsx`) is a main page + ~8 sub-pages (account, streaming services, monthly spend, your taste, tune, appearance, privacy/data). Phase the native port:

- **W1 — Main Profile page + Sign Out (priority).** Matches `V2 Profile_Profile Page.png`: header, avatar (initial), name/email/member-since, 3 stat tiles (Watchlist / Watched / Services counts), grouped action rows (custom `GenreIconTile` glyphs via `PROFILE_GLYPHS`), **Sign Out** (→ `useAuth().signOut()` → the `(tabs)` guard redirects to `/auth`). Action rows navigate to `profile/[section]` (a stub sub-screen for now, so no dead taps).
- **W2 — Key sub-screens.** Streaming Services (toggle grid → `saveUserPreferences`), Your Taste (cluster grid, view/retake), Account Details, Appearance, Tune Recommendations (the 4 sliders, reuse the onboarding slider). Reuse shared lib (`getUserPreferences`, `getV2TasteProfile`, `saveSliderState`, `TASTE_CLUSTERS`).
- **Deferred:** Monthly Spend (spend dashboard), Privacy & Data detail (export/delete flows) — richer, later.

## Data sources (all native-available)

- name/email/member-since: `useAuth().session.user` (+ `profiles.created_at`).
- Watchlist / Watched counts: `useWatchlist` (status filter). Services count: `useUserServices`.
- Glyphs: `PROFILE_GLYPHS` from the shared `genreGlyphs.ts` (native `GenreIconTile`).

## Gates

Native tsc 0, `expo export` bundles, release APK builds. **Device-verify W1 sign-out** (it also unblocks re-onboarding → the Step 4 glyph re-test). Match against `V2 Profile_Profile Page.png`. Joe's review on return.

## Notes

- Profile sub-screens push over the tabs (root-Stack routes, like `detail/[id]`).
- Icon colour: the screenshot shows per-row coloured glyphs; the live app uses uniform `GenreIconTile` (cream + orange ghost). Native uses `GenreIconTile` (consistent with the onboarding clusters Joe asked for); per-row colour is a design-review nicety.
