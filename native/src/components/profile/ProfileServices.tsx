import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ServiceBadge } from '@/components/ServiceBadge';
import { SERVICE_CATALOG } from '@/constants/serviceCatalog';
import { serviceIdToProviderId } from '@/lib/adapters/platformAdapter';
import { getUserPreferences, saveUserPreferences } from '@/lib/storage/userPreferences';
import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';
import { useUserServices } from '@/hooks/useUserServices';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Streaming Services (NATIVE-4 W2). Edit the connected stack;
// Save writes user_services via saveUserPreferences (merging onto the
// existing prefs) and invalidates the feeds so Home/For You re-score.
export function ProfileServices() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: current } = useUserServices();
  const [selected, setSelected] = useState<ServiceId[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (current && selected === null) setSelected(current);
  }, [current, selected]);

  const toggle = (id: ServiceId) =>
    setSelected((prev) => (!prev ? prev : prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

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
      await qc.invalidateQueries({ queryKey: ['native', 'userServices'] });
      await qc.invalidateQueries({ queryKey: ['native', 'home'] });
      await qc.invalidateQueries({ queryKey: ['native', 'foryou'] });
      router.back();
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

  const selectedSet = new Set(selected);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Streaming Services" />
      <ScrollView contentContainerClassName="px-5 pb-4 pt-2" showsVerticalScrollIndicator={false}>
        <Text className="font-sans text-body text-muted-foreground">
          Which platforms are you subscribed to?
        </Text>
        <View className="mt-4 flex-row flex-wrap">
          {SERVICE_CATALOG.map((svc) => {
            const isSel = selectedSet.has(svc.id);
            return (
              <View key={svc.id} className="w-1/2 p-1.5">
                <Pressable
                  onPress={() => toggle(svc.id)}
                  className={
                    isSel
                      ? 'flex-row items-center gap-2.5 rounded-card border border-primary bg-primary-soft p-3'
                      : 'flex-row items-center gap-2.5 rounded-card border border-border bg-card p-3 active:bg-secondary'
                  }>
                  <ServiceBadge service={svc.id} size="lg" />
                  <View className="flex-1">
                    <Text numberOfLines={1} className="font-sans-bold text-meta text-foreground">
                      {svc.name}
                    </Text>
                    <Text numberOfLines={1} className="font-sans text-[11px] text-muted-foreground">
                      {svc.description}
                    </Text>
                  </View>
                  {isSel ? (
                    <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
                      <Check size={12} color="#ffffff" strokeWidth={3} />
                    </View>
                  ) : (
                    <View className="h-5 w-5 rounded-full border-2 border-border" />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
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
