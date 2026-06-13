import { Text, View } from 'react-native';

// Placeholder — NATIVE-3 brings auth, settings, and data export.
export default function ProfileScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-section text-foreground">Profile</Text>
      <Text className="mt-1 text-body text-muted-foreground">NATIVE-3</Text>
    </View>
  );
}
