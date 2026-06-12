import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// NATIVE-1 W2 smoke screen — proves the two load-bearing pipelines:
//  1. Metro resolves the SHARED lib tree (../src/lib via tsconfig paths
//     + watchFolders): providerIdToServiceId is the same module the web
//     app and the Worker import.
//  2. NativeWind compiles the Tailwind classes from tailwind.config.js
//     (ported design tokens).
// Replaced by the real Home feed in W4.
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';

// TMDb provider ids → expected services, through the real adapter.
const SMOKE_PROVIDER_IDS = [8, 9, 337, 350, 531]; // netflix, prime, disney, apple, paramount

export default function HomeScreen() {
  const resolved = SMOKE_PROVIDER_IDS.map((id) => providerIdToServiceId(id));

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 py-6">
        <Text className="text-kicker font-sans uppercase tracking-widest text-primary-on-soft">
          NATIVE-1 · W2
        </Text>
        <Text className="mt-1 text-headline text-foreground">Shared tree smoke test</Text>
        <Text className="mt-2 text-body text-muted-foreground">
          The rows below come from src/lib/adapters/platformAdapter — the same module the web
          client and the videx-api Worker import. If they render, Metro is resolving the shared
          tree and NativeWind is compiling the ported tokens.
        </Text>

        <View className="mt-6 rounded-card border border-border bg-card p-4">
          {SMOKE_PROVIDER_IDS.map((providerId, i) => {
            const serviceId = resolved[i];
            return (
              <View
                key={providerId}
                className="flex-row items-center justify-between border-b border-border py-3 last:border-b-0">
                <Text className="text-body text-muted-foreground">TMDb provider {providerId}</Text>
                <Text className="text-body font-bold text-foreground">
                  {serviceId ? SERVICE_DISPLAY_NAMES[serviceId as ServiceId] : 'unmapped'}
                </Text>
              </View>
            );
          })}
        </View>

        <View className="mt-4 self-start rounded-pill bg-primary-soft px-4 py-2">
          <Text className="text-meta text-primary-on-soft">tokens: bg, card, border, primary</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
