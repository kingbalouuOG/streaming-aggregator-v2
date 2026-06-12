import { Text, View } from 'react-native';

// Placeholder — NATIVE-2 brings the For You feed (FlashList + shared
// recommendations-v2 pipeline via /v1/foryou).
export default function ForYouScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-section text-foreground">For You</Text>
      <Text className="mt-1 text-body text-muted-foreground">NATIVE-2</Text>
    </View>
  );
}
