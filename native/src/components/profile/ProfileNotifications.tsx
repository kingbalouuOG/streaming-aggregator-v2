import { useEffect, useState } from 'react';
import { Linking, Pressable, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, CalendarClock } from 'lucide-react-native';

import {
  DEFAULT_PREFERENCES,
  enableNotifications,
  fetchPreferences,
  isPermissionGranted,
  setPreference,
  type NotificationType,
} from '@/notifications/push';
import { useAuth } from '@/providers/auth';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Notifications (H0 Stream B). Per-type opt-in toggles honoured
// server-side by the daily send-notifications Edge Function. When OS
// permission isn't granted, a CTA obtains it (or routes to OS settings if
// blocked). Toggles persist regardless — flipping one back on Just Works
// once permission is restored.

const ROWS: { type: NotificationType; label: string; hint: string; icon: 'arrival' | 'leaving' }[] = [
  {
    type: 'arrival',
    label: 'New arrivals',
    hint: 'When a watchlist title lands on a service you have.',
    icon: 'arrival',
  },
  {
    type: 'leaving_soon',
    label: 'Leaving soon',
    hint: 'When a watchlist title is about to expire (~7 days out).',
    icon: 'leaving',
  },
];

export function ProfileNotifications() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [prefs, setPrefs] = useState<Record<NotificationType, boolean>>(DEFAULT_PREFERENCES);
  const [granted, setGranted] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [permission, loaded] = await Promise.all([
        isPermissionGranted(),
        userId ? fetchPreferences(userId) : Promise.resolve(DEFAULT_PREFERENCES),
      ]);
      if (!active) return;
      setGranted(permission);
      setPrefs(loaded);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const onToggle = async (type: NotificationType, value: boolean) => {
    if (!userId) return;
    setPrefs((p) => ({ ...p, [type]: value })); // optimistic
    try {
      await setPreference(userId, type, value);
    } catch {
      setPrefs((p) => ({ ...p, [type]: !value })); // revert on failure
    }
  };

  const onEnable = async () => {
    if (!userId) return;
    const result = await enableNotifications(userId);
    if (result === 'granted') setGranted(true);
    else if (result === 'blocked') Linking.openSettings().catch(() => {});
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Notifications" />
      <View className="px-5 pt-3">
        {!granted && !loading ? (
          <Pressable
            onPress={onEnable}
            className="mb-4 rounded-card border border-primary bg-primary-soft px-4 py-3.5 active:opacity-80">
            <Text className="font-sans-bold text-body text-foreground">Turn on notifications</Text>
            <Text className="mt-1 font-sans text-meta text-muted-foreground">
              Allow Videx to notify you so arrival and leaving-soon alerts can reach you.
            </Text>
          </Pressable>
        ) : null}

        <View className="gap-2">
          {ROWS.map((row) => (
            <View
              key={row.type}
              className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5">
              {row.icon === 'arrival' ? (
                <BellRing size={18} color="#ff8d5a" />
              ) : (
                <CalendarClock size={18} color="rgba(245,241,232,0.62)" />
              )}
              <View className="flex-1">
                <Text className="font-sans-bold text-body text-foreground">{row.label}</Text>
                <Text className="mt-0.5 font-sans text-meta text-muted-foreground">{row.hint}</Text>
              </View>
              <Switch
                value={prefs[row.type]}
                onValueChange={(v) => onToggle(row.type, v)}
                trackColor={{ false: '#2a2a33', true: '#e85d25' }}
                thumbColor="#f5f1e8"
                ios_backgroundColor="#2a2a33"
              />
            </View>
          ))}
        </View>

        <Text className="mt-4 font-sans text-meta leading-5 text-faint-foreground">
          Alerts are free and sent at most about once a day. Arrival alerts are always free;
          they only cover titles on your watchlist and the services you've connected.
        </Text>
      </View>
    </SafeAreaView>
  );
}
