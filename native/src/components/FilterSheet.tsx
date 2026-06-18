import Slider from '@react-native-community/slider';
import { Check, X } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  GENRE_OPTIONS,
  type BrowseFilters,
  type ContentType,
  type RuntimeBand,
  type WatchedFilter,
} from './browseFilters';
import { ServiceBadge } from './ServiceBadge';

const SERVICES = Object.keys(SERVICE_DISPLAY_NAMES) as ServiceId[];
const TYPES: { value: ContentType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV' },
  { value: 'doc', label: 'Docs' },
];
const RUNTIMES: { value: RuntimeBand; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'under_60', label: '< 60' },
  { value: '60_120', label: '60–120' },
  { value: 'over_120', label: '120+' },
];
const WATCHED: { value: WatchedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'hide', label: 'Hide' },
  { value: 'only', label: 'Only' },
];

export function FilterSheet({
  visible,
  filters,
  onApply,
  onClose,
}: {
  visible: boolean;
  filters: BrowseFilters;
  onApply: (f: BrowseFilters) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<BrowseFilters>(filters);
  useEffect(() => {
    if (visible) setLocal(filters);
  }, [visible, filters]);

  const count = countActiveFilters(local);
  const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/70">
        <SafeAreaView
          edges={['bottom']}
          className="max-h-[90%] rounded-t-[20px]"
          style={{ backgroundColor: '#13131a' }}>
          <View className="items-center pt-3">
            <View style={{ width: 38, height: 4, borderRadius: 999, backgroundColor: 'rgba(245,241,232,0.18)' }} />
          </View>
          <View
            className="flex-row items-start justify-between px-5 pb-3 pt-3"
            style={{ borderBottomWidth: 0.5, borderBottomColor: 'rgba(245,241,232,0.10)' }}>
            <View>
              <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">Refine</Text>
              <Text className="mt-0.5 font-display-bold text-title text-foreground">Filters.</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} className="mt-1">
              <X size={20} color="rgba(245,241,232,0.62)" />
            </Pressable>
          </View>

          <ScrollView contentContainerClassName="px-5 pb-4 pt-3" showsVerticalScrollIndicator={false}>
            <SectionLabel>Streaming services</SectionLabel>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {SERVICES.map((s) => {
                const on = local.services.includes(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => setLocal((p) => ({ ...p, services: toggle(p.services, s) }))}
                    className={
                      on
                        ? 'flex-row items-center gap-2 rounded-pill border border-primary-edge bg-primary-soft px-2.5 py-1.5'
                        : 'flex-row items-center gap-2 rounded-pill border border-border bg-background px-2.5 py-1.5'
                    }>
                    <ServiceBadge service={s} size="xs" />
                    <Text className={on ? 'font-sans-medium text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
                      {SERVICE_DISPLAY_NAMES[s]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <SectionLabel>Type</SectionLabel>
            <Segmented options={TYPES} value={local.contentType} onChange={(v) => setLocal((p) => ({ ...p, contentType: v }))} />

            <SectionLabel>Genre</SectionLabel>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {GENRE_OPTIONS.map((g) => {
                const on = local.genres.includes(g);
                return (
                  <Pressable
                    key={g}
                    onPress={() => setLocal((p) => ({ ...p, genres: toggle(p.genres, g) }))}
                    className={
                      on
                        ? 'rounded-pill border border-primary-edge bg-primary-soft px-3 py-1.5'
                        : 'rounded-pill border border-border bg-background px-3 py-1.5'
                    }>
                    <Text className={on ? 'font-sans-medium text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
                      {g}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="mt-5 flex-row items-center justify-between">
              <SectionLabel noMargin>Minimum rating</SectionLabel>
              <Text className={local.minRating > 0 ? 'font-sans-bold text-body text-primary' : 'font-sans-bold text-body text-muted-foreground'}>
                {local.minRating > 0 ? `${local.minRating.toFixed(1)}+` : 'Any'}
              </Text>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={9}
              step={0.5}
              value={local.minRating}
              onValueChange={(v) => setLocal((p) => ({ ...p, minRating: v }))}
              minimumTrackTintColor="#e85d25"
              maximumTrackTintColor="rgba(245,241,232,0.12)"
              thumbTintColor="#e85d25"
            />

            <SectionLabel>Runtime</SectionLabel>
            <Segmented options={RUNTIMES} value={local.runtime} onChange={(v) => setLocal((p) => ({ ...p, runtime: v }))} />

            <SectionLabel>Show watched</SectionLabel>
            <Segmented options={WATCHED} value={local.showWatched} onChange={(v) => setLocal((p) => ({ ...p, showWatched: v }))} />
          </ScrollView>

          <View
            className="flex-row items-center gap-3 px-5 pb-2 pt-3"
            style={{ borderTopWidth: 0.5, borderTopColor: 'rgba(245,241,232,0.10)' }}>
            <Pressable
              onPress={() => setLocal(DEFAULT_FILTERS)}
              className="h-12 flex-1 items-center justify-center rounded-card border border-border active:bg-secondary">
              <Text className="font-sans-bold text-body text-muted-foreground">Clear all</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onApply(local);
                onClose();
              }}
              className="h-12 flex-[1.4] flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90">
              <Check size={16} color="#fff" />
              <Text className="font-sans-bold text-body text-white">
                {count > 0 ? `Apply (${count})` : 'Apply'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function SectionLabel({ children, noMargin }: { children: ReactNode; noMargin?: boolean }) {
  return (
    <Text className={`${noMargin ? '' : 'mt-5'} font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground`}>
      {children}
    </Text>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="mt-2 flex-row gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            className={
              on
                ? 'flex-1 items-center rounded-card border border-primary-edge bg-primary-soft py-2.5'
                : 'flex-1 items-center rounded-card border border-border bg-background py-2.5 active:bg-secondary'
            }>
            <Text className={on ? 'font-sans-bold text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
