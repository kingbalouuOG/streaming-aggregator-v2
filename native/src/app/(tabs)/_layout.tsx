import { Tabs } from 'expo-router/js-tabs';
import { Bookmark, Compass, House, Sparkles, User } from 'lucide-react-native';
import type { ColorValue } from 'react-native';

// Bottom tab bar. Dark-first (theme switching arrives with NATIVE-3).
// JS tabs for now — NativeTabs (truly native bottom bar) is a later
// polish decision.
const BG = '#0a0a0f';
const CARD = '#14141c';
const CREAM_SOFT = 'rgba(245,241,232,0.62)';
const PRIMARY = '#e85d25';

type IconProps = { color: ColorValue; size: number };

export default function TabsLayout() {
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
