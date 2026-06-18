import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

// Onboarding route (NATIVE-3). 5-step flow matching the V2 Onboarding
// screenshots. Owns its step state; reached via "Create one" (signed
// out) or the (tabs) guard (signed-in but not onboarded).
export default function OnboardingRoute() {
  return <OnboardingFlow />;
}
