import { Text, View } from 'react-native';

// Placeholder — NATIVE-2 brings search + filters.
export default function BrowseScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-section text-foreground">Browse</Text>
      <Text className="mt-1 text-body text-muted-foreground">NATIVE-2</Text>
    </View>
  );
}
