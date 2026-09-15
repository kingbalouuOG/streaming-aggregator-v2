import { ArrowRight } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { servicesSummary } from '@/components/services/channelCopy';
import { ServicePicker } from '@/components/services/ServicePicker';
import { SERVICE_CATALOG } from '@/constants/serviceCatalog';
import { useChannelRegistry } from '@/hooks/useChannels';
import { heldChannelCount } from '@/lib/entitlements/channels';
import type { ServiceId } from '@/lib/types/content';

// Onboarding Step 2 — "Your streaming services". Shared ServicePicker grid;
// a selected Prime / Apple / NOW tile carries a channel strip that opens its
// channel sheet (IN-SC-006 Direction B). Select All, Continue. Everything
// saves with the rest of the flow at the end.

interface StepServicesProps {
  selected: ServiceId[];
  channels: string[];
  onToggle: (id: ServiceId) => void;
  onToggleChannel: (channelId: string) => void;
  onSelectAll: () => void;
  onContinue: () => void;
}

export function StepServices({
  selected,
  channels,
  onToggle,
  onToggleChannel,
  onSelectAll,
  onContinue,
}: StepServicesProps) {
  const { data: registry } = useChannelRegistry();
  const allSelected = selected.length === SERVICE_CATALOG.length;
  const channelCount = heldChannelCount(registry ?? [], selected, channels);

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="px-5 pt-3 pb-4" showsVerticalScrollIndicator={false}>
        <Text className="font-display-black text-headline text-foreground">
          Your streaming services
        </Text>
        <Text className="mt-1 font-sans text-body text-muted-foreground">
          Tick what you pay for. {selected.length} selected.
        </Text>

        <ServicePicker
          services={selected}
          channels={channels}
          onToggleService={onToggle}
          onToggleChannel={onToggleChannel}
        />

        <Pressable onPress={onSelectAll} className="mt-3 items-center py-2">
          <Text className="font-sans-bold text-body text-primary">
            {allSelected ? 'Clear all' : 'Select All'}
          </Text>
        </Pressable>
      </ScrollView>

      {/* CTA */}
      <View className="px-5 pb-2 pt-2">
        <Text className="mb-2 text-center font-sans text-meta text-muted-foreground">
          {selected.length === 0
            ? 'Select at least one service to continue'
            : servicesSummary(selected.length, channelCount)}
        </Text>
        <Pressable
          onPress={onContinue}
          disabled={selected.length === 0}
          className={
            selected.length > 0
              ? 'h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90'
              : 'h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary/40'
          }>
          <Text className="font-sans-bold text-section text-white">Continue</Text>
          <ArrowRight size={20} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}
