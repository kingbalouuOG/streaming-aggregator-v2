import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Bookmark, Compass, House, Sparkles, User } from 'lucide-react-native';
import { ActivityIndicator, View, type ColorValue } from 'react-native';

import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { useAuth } from '@/providers/auth';

// Bottom tab bar + the protected-route guard (NATIVE-3 W1): signed-out
// users redirect to /auth; signed-in-but-not-onboarded to /onboarding.
// Dark-first; JS tabs for now (NativeTabs is a later polish decision).
const BG = '#0a0a0f';
const CARD = '#14141c';
const CREAM_SOFT = 'rgba(245,241,232,0.62)';
const PRIMARY = '#e85d25';

type IconProps = { color: ColorValue; size: number };

export default function TabsLayout() {
  const { session, initializing } = useAuth();
  const onboarding = useOnboardingStatus(session?.user?.id);

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
          tabBarIcon: ({ color, size }: IconProps) => <Sparkles color={color} size={size ?? 22} />,
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
          tabBarIcon: ({ color, size }: IconProps) => <Bookmark color={color} size={size ?? 22} />,
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
  );
}
