import { ArrowRight } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ServicePicker } from '@/components/services/ServicePicker';
import { SERVICE_CATALOG } from '@/constants/serviceCatalog';
import type { ServiceId } from '@/lib/types/content';

// Onboarding Step 2 — "Your streaming services" (matches Step 2.png).
// 2-col grid of service cards (logo + name + description + check),
// orange border when selected, add-on channel chips under a selected
// Prime / Apple / NOW tile (IN-SC-004), Select All, Continue.

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
  const allSelected = selected.length === SERVICE_CATALOG.length;

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="px-5 pt-3 pb-4" showsVerticalScrollIndicator={false}>
        <Text className="font-display-black text-headline text-foreground">
          Your streaming services
        </Text>
        <Text className="mt-1 font-sans text-body text-muted-foreground">
          Which platforms are you subscribed to?
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
        {selected.length === 0 ? (
          <Text className="mb-2 text-center font-sans text-meta text-muted-foreground">
            Select at least one service to continue
          </Text>
        ) : (
          <Text className="mb-2 text-center font-sans text-meta text-muted-foreground">
            {selected.length} service{selected.length !== 1 ? 's' : ''} selected
          </Text>
        )}
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
