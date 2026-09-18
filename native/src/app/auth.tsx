import { useFocusEffect, useNavigation, useRoute, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuthScreen } from '@/components/auth/AuthScreen';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { useUsernameChosen } from '@/hooks/useUsernameChosen';
import { consumePendingLink, readPendingLink } from '@/pendingLink';
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
// during sign-up, and must not navigate from there. Replace-then-push, not
// router.replace(route, { withAnchor: true }): expo-router 56 has the option,
// but it anchors only a NESTED navigator's initial route, and detail, room
// and list are root-stack siblings of /auth, so it would leave the resumed
// screen with nothing beneath it (IN-GR-040).
//
// Growth S3 follow-up (IN-GR-012): only an account that has finished
// onboarding resumes the link here. A new account (Apple or Google on this
// screen, or a confirmed email sign-up signing in) is about to be sent to
// onboarding by the tabs guard, so the link is left for curating.tsx, which
// resumes it once setup is done. Wait for the onboarding answer rather than
// treating "still loading" as "not onboarded"; if the check fails, go to "/"
// and leave the link (the guard shows its retry state).
//
// IN-GR-044: an onboarded account that never chose a name meets the name
// gate before the link: /choose-username?next=curating, and curating.tsx
// resumes it after the save. And only one /auth stays on the stack: a warm
// link opened over /auth, followed by a sign-in prompt that replaces its
// screen with /auth, would otherwise leave two.
//
// G2: a shared list link is not cleared by the resume (consumePendingLink
// keeps it); the list screen clears it once join_household resolves.
export default function AuthRoute() {
  const { session, initializing } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const route = useRoute();
  const signedIn = !initializing && !!session;
  const userId = signedIn ? session?.user?.id : undefined;
  const onboarding = useOnboardingStatus(userId);
  const onboarded = onboarding.data === true;
  const usernameChosen = useUsernameChosen(onboarded ? userId : undefined);
  const onboardingKnown = signedIn && !onboarding.isLoading && !(onboarding.isFetching && !onboarding.data);
  // The (tabs) guard's stale-cache rule: a persisted `false` waits for the refetch.
  const nameKnown =
    !onboarded || !(usernameChosen.isLoading || (usernameChosen.isFetching && usernameChosen.data === false));
  const known = onboardingKnown && nameKnown;
  const needsName = onboarded && usernameChosen.data === false;

  useFocusEffect(
    useCallback(() => {
      // Keep this /auth, drop any older one beneath it (IN-GR-044).
      const state = navigation.getState();
      if (!state) return;
      const routes = state.routes.filter((r) => r.name !== route.name || r.key === route.key);
      if (routes.length === state.routes.length) return;
      navigation.dispatch({ type: 'RESET', payload: { ...state, routes, index: routes.length - 1 } });
    }, [navigation, route.key, route.name]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!known) return;
      if (needsName && readPendingLink()) {
        router.replace({ pathname: '/choose-username', params: { next: 'curating' } });
        return;
      }
      const pending = onboarded && !needsName ? consumePendingLink() : null;
      router.replace('/');
      if (pending) setTimeout(() => router.push(pending.route as Href), 0);
    }, [known, onboarded, needsName, router]),
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
