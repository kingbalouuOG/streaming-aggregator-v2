import { ArrowRight, Check } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ServiceBadge } from '@/components/ServiceBadge';
import { SERVICE_CATALOG } from '@/constants/serviceCatalog';
import type { ServiceId } from '@/lib/types/content';

// Onboarding Step 2 — "Your streaming services" (matches Step 2.png).
// 2-col grid of service cards (logo + name + description + check),
// orange border when selected, Select All, Continue.

const SERVICES = SERVICE_CATALOG;

interface StepServicesProps {
  selected: ServiceId[];
  onToggle: (id: ServiceId) => void;
  onSelectAll: () => void;
  onContinue: () => void;
}

export function StepServices({ selected, onToggle, onSelectAll, onContinue }: StepServicesProps) {
  const selectedSet = new Set(selected);
  const allSelected = selected.length === SERVICES.length;

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="px-5 pt-3 pb-4" showsVerticalScrollIndicator={false}>
        <Text className="font-display-black text-headline text-foreground">
          Your streaming services
        </Text>
        <Text className="mt-1 font-sans text-body text-muted-foreground">
          Which platforms are you subscribed to?
        </Text>

        <View className="mt-4 flex-row flex-wrap">
          {SERVICES.map((svc) => {
            const isSel = selectedSet.has(svc.id);
            return (
              <View key={svc.id} className="w-1/2 p-1.5">
                <Pressable
                  onPress={() => onToggle(svc.id)}
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
