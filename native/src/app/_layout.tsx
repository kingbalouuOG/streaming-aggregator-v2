import '../global.css';

import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';

// Dark-first skeleton (NATIVE-1 W3 fills in theme switching + icons).
// JS tabs for now — NativeTabs (truly native bottom bar) is a NATIVE-2
// polish decision once real tab icons exist.
const BG = '#0a0a0f';
const CARD = '#14141c';
const CREAM_SOFT = 'rgba(245,241,232,0.62)';
const PRIMARY = '#e85d25';

export default function RootLayout() {
  return (
    <>
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
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="foryou" options={{ title: 'For You' }} />
        <Tabs.Screen name="browse" options={{ title: 'Browse' }} />
        <Tabs.Screen name="watchlist" options={{ title: 'Watchlist' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </>
  );
}
