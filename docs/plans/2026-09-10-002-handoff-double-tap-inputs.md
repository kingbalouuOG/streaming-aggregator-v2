# Handoff: text fields and buttons need two taps (IN-UX-001)

**Date:** 2026-09-10 · **Reported by:** Joe, from device use during the service-coverage-wave-1 review · **Parking lot:** IN-UX-001 · One session, its own branch. Nothing here depends on PR #153.

---

```
Context: Videx native app (native/, Expo 56, React Native 0.85.3, new architecture, NativeWind 4). Shared logic lives in ../src/lib, mounted at native/src/lib by a junction that `npm install`'s postinstall creates — never recursive-delete inside native/.

Bug (IN-UX-001, see videx-wiki/wiki/registers/parking-lot.md): text fields and buttons need two taps. The first tap does nothing at all; the second focuses the field and raises the keyboard. Joe reports it throughout the app, not on one screen, and noticed it most on the Browse search field. It is pre-existing and unrelated to service coverage wave 1, which touches no TextInput.

DO NOT ASSUME THE OBVIOUS CAUSE. A ScrollView swallowing the first tap is the textbook explanation and it was already checked, and it does not fit:
  - native/src/app/(tabs)/browse.tsx renders its TextInput inside a plain <View> with no scroll parent, and that is where the bug was noticed.
  - There is no global TouchableWithoutFeedback or Keyboard.dismiss wrapper anywhere in native/src.
  - Only two of the nine TextInput screens have a ScrollView missing `keyboardShouldPersistTaps="handled"`: ReportSheet.tsx and ProfilePrivacy.tsx. Those two are worth fixing regardless, but they cannot explain an app-wide symptom, and fixing them without evidence would look like a fix and change nothing.

The nine files containing a TextInput: app/(tabs)/browse.tsx, app/forgot-password.tsx, app/reset-password.tsx, components/auth/AuthScreen.tsx, components/FeedbackSheet.tsx, components/onboarding/StepAccount.tsx, components/profile/ProfileAccount.tsx, components/profile/ProfilePrivacy.tsx, components/ReportSheet.tsx. Six of them already set keyboardShouldPersistTaps.

Start by reproducing it on hardware and characterising it precisely, because the report is broad and the fix depends on which of these it actually is:
1. Does it happen on the FIRST interaction after a screen mounts, or on every tap?
2. Does it happen when no keyboard is currently up, or only when focus is moving from another field?
3. Does it affect plain Pressables with no text input involved? Joe's report says "text fields and buttons", which if true rules out anything keyboard-specific.
4. Is it worse right after a tab switch or a navigation push?
5. Does it reproduce in a Modal-presented sheet versus a plain screen?

Then chase the likely causes in this order:
  a. New-architecture touch handling. RN 0.85.3 on the new architecture; check for known Fabric touch-responder issues at this version, and whether react-native-screens' native stack is intercepting the first touch after a transition settles.
  b. The tab navigator. expo-router tabs; a screen that is still animating or not yet the focused route can swallow a touch.
  c. Modal presentation races on the sheets (FeedbackSheet, ReportSheet, ProfilePrivacy all present in a Modal).
  d. NativeWind 4 `active:` variants forcing a re-render on press-in and losing the responder.

Device access: TestFlight delivery is broken on Joe's iPhone and the cause is already ruled out, so do not re-investigate it — use an EAS ad-hoc build via `gh workflow run ios-release.yml -f profile=preview`, and note that the device only receives an over-the-air update when the ad-hoc build's app version matches the current one (a release bump orphans it; see the 2026-09-10 session). The device is already registered.

Deliverables: a characterisation of the bug from a real device with the evidence that identifies the cause, the fix, and the two missing `keyboardShouldPersistTaps` props folded in whether or not they turn out to be the cause. Update IN-UX-001 with what it actually was and append to videx-wiki/log.md. Worktree branch off main, relative paths, `npx expo lint` in native/ before the PR.
```
