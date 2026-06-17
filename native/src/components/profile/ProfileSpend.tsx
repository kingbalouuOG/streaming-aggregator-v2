import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ServiceBadge } from '@/components/ServiceBadge';
import { useUserServices } from '@/hooks/useUserServices';
import { getDefaultTier } from '@/lib/data/platformPricing';
import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Monthly Spend (web SpendDashboard). Estimates the monthly cost
// from each connected service's standard UK plan (platformPricing).

export function ProfileSpend() {
  const { data: services } = useUserServices();
  const rows = (services ?? []).map((s) => {
    const tier = getDefaultTier(s);
    return { id: s, name: SERVICE_DISPLAY_NAMES[s], tier: tier?.name ?? '—', price: tier?.price ?? 0 };
  });
  const total = rows.reduce((sum, r) => sum + r.price, 0);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Monthly Spend" />
      <ScrollView contentContainerClassName="px-5 pb-6 pt-3">
        <View className="items-center rounded-card border border-border bg-card py-6">
          <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
            Estimated monthly
          </Text>
          <Text className="mt-1 font-display-black text-foreground" style={{ fontSize: 44 }}>
            £{total.toFixed(2)}
          </Text>
          <Text className="mt-1 font-sans text-meta text-muted-foreground">
            across {rows.length} service{rows.length !== 1 ? 's' : ''}
          </Text>
        </View>

        <Text className="mb-2 mt-5 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
          Breakdown
        </Text>
        {rows.map((r) => (
          <View key={r.id} className="mb-2 flex-row items-center gap-3 rounded-card border border-border bg-card p-3.5">
            <ServiceBadge service={r.id as ServiceId} size="md" />
            <View className="flex-1">
              <Text className="font-sans-bold text-body text-foreground">{r.name}</Text>
              <Text className="mt-0.5 font-sans text-meta text-muted-foreground">{r.tier}</Text>
            </View>
            <Text className="font-sans-bold text-body text-foreground">
              {r.price > 0 ? `£${r.price.toFixed(2)}` : 'Free'}
            </Text>
          </View>
        ))}

        <Text className="mt-3 text-center font-sans text-meta text-faint-foreground leading-5">
          Estimated from standard UK plan prices. Your actual plan may differ.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
