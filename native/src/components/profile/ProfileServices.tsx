import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { joinNames, servicesSummary } from '@/components/services/channelCopy';
import { ServicePicker } from '@/components/services/ServicePicker';
import { useChannelRegistry, useUserChannels } from '@/hooks/useChannels';
import { useUserServices } from '@/hooks/useUserServices';
import { serviceIdToProviderId } from '@/lib/adapters/platformAdapter';
import { heldChannelCount } from '@/lib/entitlements/channels';
import { setUserChannels } from '@/lib/storage/serviceChannels';
import { getUserPreferences, saveUserPreferences } from '@/lib/storage/userPreferences';
import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Streaming Services (NATIVE-4 W2; IN-SC-006 Direction B). Edit the
// connected stack and the add-on channels inside it. Save is disabled until
// something changed; saving writes user_services via saveUserPreferences
// (merging onto the existing prefs) and channels via set_own_service_addons,
// invalidates the feeds, and replaces the CTA in place with a "Saved" card.
// The user stays on the screen and leaves with Back.

const sameSet = (a: readonly string[] | null, b: readonly string[] | null) =>
  [...(a ?? [])].sort().join(',') === [...(b ?? [])].sort().join(',');

export function ProfileServices() {
  const qc = useQueryClient();
  const { data: current } = useUserServices();
  const { data: currentChannels } = useUserChannels();
  const { data: registry } = useChannelRegistry();

  const [selected, setSelected] = useState<ServiceId[] | null>(null);
  // Stays null until the stored channels load (or the user touches a chip),
  // so Save never replaces channels it could not read with an empty set.
  const [channels, setChannels] = useState<string[] | null>(null);
  // What the server holds, as last loaded or saved — the "dirty" baseline.
  const [baseServices, setBaseServices] = useState<ServiceId[] | null>(null);
  const [baseChannels, setBaseChannels] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (current && selected === null) {
      setSelected(current);
      setBaseServices(current);
    }
  }, [current, selected]);

  useEffect(() => {
    if (currentChannels && channels === null) {
      setChannels(currentChannels);
      setBaseChannels(currentChannels);
    }
  }, [currentChannels, channels]);

  const dirty =
    selected !== null &&
    (!sameSet(selected, baseServices) || (channels !== null && !sameSet(channels, baseChannels)));

  const toggle = (id: ServiceId) =>
    setSelected((prev) => (!prev ? prev : prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const toggleChannel = (id: string) =>
    setChannels((prev) => {
      const base = prev ?? [];
      return base.includes(id) ? base.filter((c) => c !== id) : [...base, id];
    });

  const save = async () => {
    if (!selected || saving || !dirty) return;
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
      setBaseServices(selected);

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

      if (!channelsSaved) {
        Alert.alert(
          "Couldn't save your channels",
          'Your services were saved. Check your connection and tap Save changes again.',
        );
        return;
      }

      // Name the channels this save added; removals alone read as "up to date".
      const before = new Set(baseChannels ?? []);
      const addedNames = [
        ...new Set(
          (channels ?? [])
            .filter((id) => !before.has(id))
            .map((id) => registry?.find((r) => r.channelId === id)?.displayName)
            .filter((name): name is string => Boolean(name)),
        ),
      ];
      setBaseChannels(channels);
      setSavedMessage(
        addedNames.length > 0
          ? `We'll include ${joinNames(addedNames)} titles in For You — within 20 minutes, or pull to refresh.`
          : 'Your services are up to date.',
      );
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

  const subtitle = servicesSummary(selected.length, heldChannelCount(registry ?? [], selected, channels ?? []));

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Streaming Services" subtitle={subtitle} />
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
        {!dirty && savedMessage ? (
          <View
            accessibilityLiveRegion="polite"
            className="flex-row items-start gap-3 rounded-card border border-border bg-card px-4 py-3.5">
            <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check size={12} color="#ffffff" strokeWidth={3} />
            </View>
            <View className="flex-1">
              <Text className="font-sans-bold text-body text-foreground">Saved</Text>
              <Text className="mt-0.5 font-sans text-meta text-muted-foreground">{savedMessage}</Text>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={save}
            disabled={!dirty || saving}
            className={
              dirty
                ? 'h-14 flex-row items-center justify-center rounded-card bg-primary active:opacity-90'
                : 'h-14 flex-row items-center justify-center rounded-card bg-primary/40'
            }>
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="font-sans-bold text-section text-white">{dirty ? 'Save changes' : 'Save'}</Text>
            )}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
