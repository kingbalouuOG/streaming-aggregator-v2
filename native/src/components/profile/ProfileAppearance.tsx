import { Check, Moon, Sun } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SubScreenHeader } from './SubScreenHeader';

// Profile → Appearance (NATIVE-4 W2). Dark is the only theme for now;
// the light "paper" theme is a deferred phase (the row reflects that).
export function ProfileAppearance() {
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Appearance" />
      <View className="px-5 pt-3">
        <Text className="font-sans text-body text-muted-foreground">Theme</Text>
        <View className="mt-3 gap-2">
          <View className="flex-row items-center gap-3 rounded-card border border-primary bg-primary-soft px-4 py-3.5">
            <Moon size={18} color="#ff8d5a" />
            <Text className="flex-1 font-sans-bold text-body text-foreground">Dark</Text>
            <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check size={12} color="#ffffff" strokeWidth={3} />
            </View>
          </View>
          <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5 opacity-50">
            <Sun size={18} color="rgba(245,241,232,0.62)" />
            <Text className="flex-1 font-sans-medium text-body text-muted-foreground">Light</Text>
            <Text className="font-sans text-meta text-muted-foreground">Coming soon</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
