import '../global.css';

import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
  useFonts,
} from '@expo-google-fonts/dm-sans';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { AuthProvider } from '@/providers/auth';
import { NotificationsProvider } from '@/providers/notifications';
import { QUERY_CACHE_BUSTER, queryPersister } from '@/queryPersist';

const DAY_MS = 24 * 60 * 60 * 1000;

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
          // gcTime must be >= the persister maxAge or queries get GC'd
          // before they can be restored from disk.
          queries: { retry: 2, refetchOnWindowFocus: false, gcTime: DAY_MS },
        },
      }),
  );

  const [fontsLoaded, fontsError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    // Fraunces optical-size cuts (scripts/generate-fraunces-cuts.py).
    'Fraunces-Hero': require('../../assets/fonts/Fraunces-Hero.ttf'),
    'Fraunces-Display': require('../../assets/fonts/Fraunces-Display.ttf'),
    'Fraunces-Title': require('../../assets/fonts/Fraunces-Title.ttf'),
    'Fraunces-Standfirst': require('../../assets/fonts/Fraunces-Standfirst.ttf'),
    'Fraunces-Body': require('../../assets/fonts/Fraunces-Body.ttf'),
    'Fraunces-Italic': require('../../assets/fonts/Fraunces-Italic.ttf'),
    'Fraunces-Dropcap': require('../../assets/fonts/Fraunces-Dropcap.ttf'),
    'Fraunces-Card': require('../../assets/fonts/Fraunces-Card.ttf'),
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
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: DAY_MS, buster: QUERY_CACHE_BUSTER }}>
      <StatusBar style="light" />
      <AuthProvider>
        <NotificationsProvider>
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
        </NotificationsProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
