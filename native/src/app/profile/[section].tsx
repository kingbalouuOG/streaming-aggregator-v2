import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Profile sub-screen stub (NATIVE-4 W1). W2 replaces these with the real
// Streaming Services / Your Taste / Account / Appearance / Tune screens.

const TITLES: Record<string, string> = {
  account: 'Account Details',
  services: 'Streaming Services',
  spend: 'Monthly Spend',
  taste: 'Your Taste',
  tune: 'Tune Recommendations',
  appearance: 'Appearance',
  privacy: 'Privacy & Data',
};

export default function ProfileSectionRoute() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section: string }>();
  const title = TITLES[section ?? ''] ?? 'Settings';

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-row items-center gap-2 px-4 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-card active:bg-secondary">
          <ArrowLeft size={18} color="#f5f1e8" />
        </Pressable>
        <Text className="font-display-bold text-title text-foreground">{title}</Text>
      </View>
      <View className="flex-1 items-center justify-center px-10">
        <Text className="text-center font-sans text-body text-muted-foreground">
          Coming in the next work item.
        </Text>
      </View>
    </SafeAreaView>
  );
}
