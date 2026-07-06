/**
 * One-shot cross-screen signal: onboarding completion → Home's first
 * render, used to fire `first_home_view` exactly once (roadmap 0.2).
 *
 * The web app tracks this with a ref on the always-mounted App component
 * (src/App.tsx ~350). Native routes are separate trees — OnboardingFlow
 * unmounts when it router.replace()s to /(tabs) — so a component ref
 * can't carry the bit across. A module-level flag does: the JS context
 * persists across expo-router navigation, so the value set on completion
 * is still readable on the Home screen's first render. Consumed exactly
 * once so a later manual return to Home doesn't re-fire the event.
 */
let justOnboarded = false;

export function markJustOnboarded(): void {
  justOnboarded = true;
}

/** Returns true exactly once after markJustOnboarded(); false thereafter. */
export function consumeJustOnboarded(): boolean {
  if (!justOnboarded) return false;
  justOnboarded = false;
  return true;
}
