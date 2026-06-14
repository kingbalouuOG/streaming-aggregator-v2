import '../global.css';

import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
  useFonts,
} from '@expo-google-fonts/dm-sans';
import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_800ExtraBold,
} from '@expo-google-fonts/fraunces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { AuthProvider } from '@/providers/auth';

// Root layout: fonts + query provider + a single always-mounted Stack.
// Auth/onboarding gating is done by REDIRECTS in the (tabs) guard
// (NATIVE-3 W1) rather than conditionally swapping the navigator — so
// the onboarding route owns its step state and signUp mid-flow doesn't
// remount it.
const BG = '#0a0a0f';

// Hold the splash until fonts are in — Fraunces/DM Sans ARE the brand;
// a system-font flash is the native equivalent of the UX-1 white flash.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 2, refetchOnWindowFocus: false },
        },
      }),
  );

  const [fontsLoaded, fontsError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontsError]);

  if (!fontsLoaded && !fontsError) {
    return null; // splash stays up
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <AuthProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: BG },
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="detail/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="profile/[section]" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
