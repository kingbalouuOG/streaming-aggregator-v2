import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
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
//
// Growth S3 follow-up (IN-GR-012): only an account that has finished
// onboarding resumes the link here. A new account (Apple or Google on this
// screen, or a confirmed email sign-up signing in) is about to be sent to
// onboarding by the tabs guard, so the link is left for curating.tsx, which
// resumes it once setup is done. Wait for the onboarding answer rather than
// treating "still loading" as "not onboarded"; if the check fails, go to "/"
// and leave the link (the guard shows its retry state).
export default function AuthRoute() {
  const { session, initializing } = useAuth();
  const router = useRouter();
  const signedIn = !initializing && !!session;
  const onboarding = useOnboardingStatus(signedIn ? session?.user?.id : undefined);
  const known = signedIn && !onboarding.isLoading && !(onboarding.isFetching && !onboarding.data);
  const onboarded = onboarding.data === true;

  useFocusEffect(
    useCallback(() => {
      if (!known) return;
      const pending = onboarded ? consumePendingLink() : null;
      router.replace('/');
      if (pending) setTimeout(() => router.push(pending.route as Href), 0);
    }, [known, onboarded, router]),
  );

  if (signedIn) {
    // Signed in, waiting for the onboarding answer before routing on: show
    // that something is happening rather than a blank screen (sweep F5).
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }
  return <AuthScreen />;
}
