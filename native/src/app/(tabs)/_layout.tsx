import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Bookmark, House, Search, Sparkle, User } from 'lucide-react-native';
import { ActivityIndicator, View, type ColorValue } from 'react-native';

import { FeedbackHost } from '@/components/FeedbackHost';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useAuth } from '@/providers/auth';

// Bottom tab bar + the protected-route guard (NATIVE-3 W1): signed-out
// users redirect to /auth; signed-in-but-not-onboarded to /onboarding.
// Icon weight tuned to the live app (thin 1.6 stroke, single-star For You,
// Watchlist count badge, DM Sans labels) — design-review audit 2026-06-17.
const BG = '#0a0a0f';
const CARD = '#14141c';
const CREAM_SOFT = 'rgba(245,241,232,0.55)';
const PRIMARY = '#e85d25';
const STROKE = 1.6;

type IconProps = { color: ColorValue; size: number };

export default function TabsLayout() {
  const { session, initializing } = useAuth();
  const onboarding = useOnboardingStatus(session?.user?.id);
  const { data: watchlist } = useWatchlist();
  const wantCount = (watchlist ?? []).filter((i) => i.status === 'want_to_watch').length;

  if (initializing || (session && onboarding.isLoading)) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }
  if (!session) return <Redirect href="/auth" />;
  if (!onboarding.data) return <Redirect href="/onboarding" />;

  return (
    <>
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
        tabBarLabelStyle: { fontFamily: 'DMSans_500Medium', fontSize: 10, letterSpacing: 0.2 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }: IconProps) => <House color={color} size={size ?? 24} strokeWidth={STROKE} />,
        }}
      />
      <Tabs.Screen
        name="foryou"
        options={{
          title: 'For You',
          tabBarIcon: ({ color, size }: IconProps) => <Sparkle color={color} size={size ?? 24} strokeWidth={STROKE} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, size }: IconProps) => <Search color={color} size={size ?? 24} strokeWidth={STROKE} />,
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: 'Watchlist',
          tabBarIcon: ({ color, size }: IconProps) => <Bookmark color={color} size={size ?? 24} strokeWidth={STROKE} />,
          tabBarBadge: wantCount > 0 ? wantCount : undefined,
          tabBarBadgeStyle: { backgroundColor: PRIMARY, color: '#ffffff', fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }: IconProps) => <User color={color} size={size ?? 24} strokeWidth={STROKE} />,
        }}
      />
    </Tabs>
      {/* One-time timed feedback prompt — overlays the signed-in tab area. */}
      <FeedbackHost />
    </>
  );
}
