import { Redirect } from 'expo-router';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { useAuth } from '@/providers/auth';

// Sign-in route. The (tabs) guard redirects signed-out users here; "Create
// one" pushes /onboarding (account creation is onboarding Step 1).
//
// IMPORTANT: bounce back to the root once a session exists. A successful
// sign-in flips session non-null, but the redirect INTO /auth is
// one-directional — without this the user stays stuck on the sign-in
// screen after signing in. Routing to "/" lets the (tabs) guard sort
// tabs vs onboarding.
export default function AuthRoute() {
  const { session, initializing } = useAuth();
  if (!initializing && session) return <Redirect href="/" />;
  return <AuthScreen />;
}
