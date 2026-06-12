import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { Bookmark, Compass, House, Sparkles, User } from 'lucide-react-native';
import { useState } from 'react';
import type { ColorValue } from 'react-native';

// Dark-first shell (theme switching arrives with NATIVE-2/3). JS tabs
// for now — NativeTabs (truly native bottom bar) is a NATIVE-2 polish
// decision. Query persistence to MMKV is NATIVE-2 (the UX-1 instant-
// For-You lesson) — a session-scoped client is enough for Home v0.
const BG = '#0a0a0f';
const CARD = '#14141c';
const CREAM_SOFT = 'rgba(245,241,232,0.62)';
const PRIMARY = '#e85d25';

type IconProps = { color: ColorValue; size: number };

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 2, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: BG },
          tabBarStyle: {
            backgroundColor: CARD,
            borderTopColor: 'rgba(245,241,232,0.10)',
          },
          tabBarActiveTintColor: PRIMARY,
          tabBarInactiveTintColor: CREAM_SOFT,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }: IconProps) => <House color={color} size={size ?? 22} />,
          }}
        />
        <Tabs.Screen
          name="foryou"
          options={{
            title: 'For You',
            tabBarIcon: ({ color, size }: IconProps) => (
              <Sparkles color={color} size={size ?? 22} />
            ),
          }}
        />
        <Tabs.Screen
          name="browse"
          options={{
            title: 'Browse',
            tabBarIcon: ({ color, size }: IconProps) => <Compass color={color} size={size ?? 22} />,
          }}
        />
        <Tabs.Screen
          name="watchlist"
          options={{
            title: 'Watchlist',
            tabBarIcon: ({ color, size }: IconProps) => (
              <Bookmark color={color} size={size ?? 22} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }: IconProps) => <User color={color} size={size ?? 22} />,
          }}
        />
      </Tabs>
    </QueryClientProvider>
  );
}
