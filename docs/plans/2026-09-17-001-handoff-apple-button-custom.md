# Handoff: custom Sign in with Apple button (IN-GR-032)

**Date:** 2026-09-17 · **Source:** Growth S5 device pass (Joe, iPhone 2.5.0 ad-hoc) · **Size:** S, JS-only, ships by OTA

```
Context: Videx. Live RN/Expo 56 app in native/ (native/src/lib is a junction to the shared src/lib; never recursive-delete inside native/). Read first: native/src/components/auth/ProviderSignIn.tsx (the Apple and Google buttons, shared by the sign-in screen native/src/components/auth/AuthScreen.tsx and onboarding Step 1), native/src/providers/auth.tsx (signInWithApple, which calls AppleAuthentication.signInAsync itself; the button is UI only), videx-wiki/wiki/registers/parking-lot.md (IN-GR family), and the memory note reference_ios_device_testing (Joe's iPhone takes ad-hoc builds only; JS fixes reach it by OTA via ota-update.yml, channel preview, platform ios, which fails loudly when the fingerprint does not match). Worktree branch off main named fix/apple-button-custom, relative paths.

Problem (found on device in Growth S5, IN-GR-032): on the sign-in screen the "Sign in with Apple" label is visibly larger than "Sign in with Google" and the orange "Sign In" CTA. The Apple button is the system AppleAuthentication.AppleAuthenticationButton (WHITE style, 56pt tall, 12pt corner radius). iOS sizes its title from the button height, and the component exposes no font size, so the text cannot be shrunk while keeping the 56pt height that pairs it with Google.

Decision (Joe, 17 Sept): make the text match. Replace the system button with a custom Pressable that follows Apple's Human Interface Guidelines for a custom Sign in with Apple button, styled as a pair with the existing Google button.

Do:
1. Read Apple's current HIG page for Sign in with Apple (custom buttons section) and the downloadable Apple logo resources before writing anything; do not draw the Apple logo from memory. Record the rules you applied (logo asset and proportions, title wording, white style colours, minimum size, corner radius, padding) as a comment block in ProviderSignIn.tsx, next to the existing Google branding comment.
2. Build the Apple button as a Pressable with the same geometry as the Google button: h-14 (56pt), rounded-card (12pt), white fill, label "Sign in with Apple" (verb signIn) or "Continue with Apple" (verb continue), label typography matching Google's (font-sans-medium text-section, 18px) unless the HIG requires the system font, in which case use the system font at the same 18pt size and say so in the summary. Black logo and black label on white. Keep: iOS-only (isAppleAvailable), the busy spinner, the 0.5 opacity when inactive, accessibilityRole button and an accessibilityLabel equal to the visible label, and the existing run('apple', signInWithApple) handler. Remove the expo-apple-authentication button import only if nothing else uses it (signInAsync in providers/auth.tsx still needs the package).
3. Both places render it: the sign-in screen (Sign in with) and onboarding Step 1 (Continue with). Check both.
4. Gates: native `npx tsc --noEmit` and `npm run lint` (root npm install first), root vitest unaffected.
5. One PR. Merge is Joe's. Before merge, publish to Joe's iPhone: `gh workflow run ota-update.yml --ref fix/apple-button-custom -f channel=preview -f platform=ios -f message="IN-GR-032 custom Apple button"`; the branch must carry main's native/app.json (2.5.0) or the reachability step fails.
6. Device check with Joe (iPhone, close and reopen Videx twice to apply the OTA): screenshot the sign-in screen and onboarding Step 1; Apple and Google labels read the same size; tapping Apple opens the Apple sheet, cancel returns quietly, a returning Apple account signs in. Android: no Apple button, Google unchanged.
7. Wiki: close IN-GR-032 in videx-wiki/wiki/registers/parking-lot.md with the PR number and the HIG rules applied; append videx-wiki/log.md.

Out of scope: Google button changes, email form changes (the passive Sign In CTA shipped in Growth S5 as IN-GR-033), any auth logic. App Review risk: a custom Apple button that breaks the HIG can be rejected, so the summary must list each HIG rule and how the button meets it.
```
