import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GenreIconTile } from '@/components/GenreIconTile';
import { useUserServices } from '@/hooks/useUserServices';
import { CLUSTER_GLYPHS } from '@/lib/constants/genreGlyphs';
import { getUserPreferences, saveUserPreferences } from '@/lib/storage/userPreferences';
import { bootstrapTasteVector } from '@/lib/taste-v2/bootstrap';
import { getV2TasteProfile, saveV2TasteVector } from '@/lib/taste-v2/tasteProfileV2';
import { MIN_CLUSTERS, TASTE_CLUSTERS } from '@/lib/taste-v2/tasteClusters';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Your Taste (NATIVE-4 W2). Loads the saved clusters, lets the
// user retune them (min 3), Save re-saves prefs (clusters + homeGenres)
// and re-bootstraps the v2 taste vector from the new clusters. No watched
// titles are re-asked here, so the retake is cluster-seeded.
export function ProfileTaste() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: services } = useUserServices();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getV2TasteProfile().then((p) => setSelected(p?.selectedClusters ?? []));
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => (!prev ? prev : prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const save = async () => {
    if (!selected || saving || selected.length < MIN_CLUSTERS) return;
    setSaving(true);
    try {
      const existing = await getUserPreferences();
      const seen = new Set<number>();
      const homeGenres: number[] = [];
      for (const clusterId of selected) {
        for (const g of TASTE_CLUSTERS.find((c) => c.id === clusterId)?.tmdbGenreIds ?? []) {
          if (!seen.has(g)) {
            seen.add(g);
            homeGenres.push(g);
          }
        }
      }
      await saveUserPreferences({
        region: existing?.region ?? 'GB',
        platforms: existing?.platforms ?? [],
        homeGenres,
        selectedClusters: selected,
      });

      // Re-seed the taste vector from the new clusters.
      const clusterRepresentativeTmdbIds = selected.flatMap(
        (id) => TASTE_CLUSTERS.find((c) => c.id === id)?.representativeTmdbIds ?? [],
      );
      const vector = await bootstrapTasteVector({
        serviceIds: services ?? [],
        watchedTitles: [],
        clusterRepresentativeTmdbIds,
      });
      if (vector) await saveV2TasteVector(vector, 0, 'manual_retake');

      await qc.invalidateQueries({ queryKey: ['native', 'foryou'] });
      await qc.invalidateQueries({ queryKey: ['native', 'home'] });
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
  const canSave = selected.length >= MIN_CLUSTERS;

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Your Taste" />
      <ScrollView contentContainerClassName="px-5 pb-4 pt-2" showsVerticalScrollIndicator={false}>
        <Text className="font-sans text-body text-muted-foreground">
          The genres you love. Pick at least {MIN_CLUSTERS}.
        </Text>
        <View className="mt-4 flex-row flex-wrap">
          {TASTE_CLUSTERS.map((c) => {
            const isSel = selectedSet.has(c.id);
            return (
              <View key={c.id} className="w-1/2 p-1.5">
                <Pressable
                  onPress={() => toggle(c.id)}
                  className={
                    isSel
                      ? 'flex-row items-center gap-2.5 rounded-card border border-primary bg-primary-soft p-3'
                      : 'flex-row items-center gap-2.5 rounded-card border border-border bg-card p-3 active:bg-secondary'
                  }>
                  <GenreIconTile glyph={CLUSTER_GLYPHS[c.id]} size={36} />
                  <Text
                    numberOfLines={2}
                    className={
                      isSel
                        ? 'flex-1 font-sans-bold text-meta text-primary-on-soft'
                        : 'flex-1 font-sans-medium text-meta text-muted-foreground'
                    }>
                    {c.name}
                  </Text>
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
          disabled={!canSave || saving}
          className={
            canSave && !saving
              ? 'h-14 flex-row items-center justify-center rounded-card bg-primary active:opacity-90'
              : 'h-14 flex-row items-center justify-center rounded-card bg-primary/40'
          }>
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
