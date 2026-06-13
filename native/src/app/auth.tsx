import { AuthScreen } from '@/components/auth/AuthScreen';

// Sign-in route (NATIVE-3 W1). The (tabs) guard redirects signed-out
// users here. "Create one" pushes /onboarding (account creation is
// onboarding Step 1).
export default function AuthRoute() {
  return <AuthScreen />;
}
