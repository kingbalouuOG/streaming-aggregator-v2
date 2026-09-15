import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ServicePicker } from '@/components/services/ServicePicker';
import { useUserChannels } from '@/hooks/useChannels';
import { useUserServices } from '@/hooks/useUserServices';
import { serviceIdToProviderId } from '@/lib/adapters/platformAdapter';
import { setUserChannels } from '@/lib/storage/serviceChannels';
import { getUserPreferences, saveUserPreferences } from '@/lib/storage/userPreferences';
import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Streaming Services (NATIVE-4 W2). Edit the connected stack and
// the add-on channels inside it (IN-SC-004); Save writes user_services via
// saveUserPreferences (merging onto the existing prefs), channels via
// set_own_service_addons, and invalidates the feeds so Home/For You re-score.
export function ProfileServices() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: current } = useUserServices();
  const { data: currentChannels } = useUserChannels();
  const [selected, setSelected] = useState<ServiceId[] | null>(null);
  // Stays null until the stored channels load (or the user touches a chip),
  // so Save never replaces channels it could not read with an empty set.
  const [channels, setChannels] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (current && selected === null) setSelected(current);
  }, [current, selected]);

  useEffect(() => {
    if (currentChannels && channels === null) setChannels(currentChannels);
  }, [currentChannels, channels]);

  const toggle = (id: ServiceId) =>
    setSelected((prev) => (!prev ? prev : prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const toggleChannel = (id: string) =>
    setChannels((prev) => {
      const base = prev ?? [];
      return base.includes(id) ? base.filter((c) => c !== id) : [...base, id];
    });

  const save = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const existing = await getUserPreferences();
      const platforms = selected.map((sid) => ({
        id: serviceIdToProviderId(sid),
        name: SERVICE_DISPLAY_NAMES[sid],
        selected: true,
      }));
      await saveUserPreferences({
        region: existing?.region ?? 'GB',
        platforms,
        homeGenres: existing?.homeGenres,
        selectedClusters: existing?.selectedClusters,
      });

      let channelsSaved = true;
      if (channels !== null) {
        try {
          await setUserChannels(channels);
        } catch (e) {
          channelsSaved = false;
          console.error('[ProfileServices] channel save failed:', e);
        }
      }

      await qc.invalidateQueries({ queryKey: ['native', 'userServices'] });
      await qc.invalidateQueries({ queryKey: ['native', 'userChannels'] });
      await qc.invalidateQueries({ queryKey: ['native', 'home'] });
      await qc.invalidateQueries({ queryKey: ['native', 'foryou'] });

      if (channelsSaved) {
        router.back();
      } else {
        Alert.alert(
          "Couldn't save your channels",
          'Your services were saved. Check your connection and tap Save again.',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  if (!selected) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#e85d25" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Streaming Services" />
      <ScrollView contentContainerClassName="px-5 pb-4 pt-2" showsVerticalScrollIndicator={false}>
        <Text className="font-sans text-body text-muted-foreground">
          Which platforms are you subscribed to?
        </Text>
        <ServicePicker
          services={selected}
          channels={channels ?? []}
          onToggleService={toggle}
          onToggleChannel={toggleChannel}
        />
      </ScrollView>
      <View className="px-5 pb-2 pt-2">
        <Pressable
          onPress={save}
          disabled={saving}
          className="h-14 flex-row items-center justify-center rounded-card bg-primary active:opacity-90">
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="font-sans-bold text-section text-white">Save</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
