import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { consumePendingLink } from '@/pendingLink';
import { useAuth } from '@/providers/auth';

// Sign-in route. The (tabs) guard redirects signed-out users here; "Create
// one" pushes /onboarding (account creation is onboarding Step 1).
//
// IMPORTANT: bounce back to the root once a session exists. A successful
// sign-in flips session non-null, but the redirect INTO /auth is
// one-directional — without this the user stays stuck on the sign-in
// screen after signing in. Routing to "/" lets the (tabs) guard sort
// tabs vs onboarding.
//
// Growth S1: if a shared link was opened while signed out, resume it on
// top of the tabs (so Back returns to them, not to a dead end). A focus
// effect, like <Redirect>: this screen stays mounted beneath /onboarding
// during sign-up, and must not navigate from there.
export default function AuthRoute() {
  const { session, initializing } = useAuth();
  const router = useRouter();
  const signedIn = !initializing && !!session;

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      const pending = consumePendingLink();
      router.replace('/');
      if (pending) setTimeout(() => router.push(pending.route as Href), 0);
    }, [signedIn, router]),
  );

  if (signedIn) return null;
  return <AuthScreen />;
}
