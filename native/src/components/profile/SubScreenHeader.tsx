import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

// Shared header for Profile sub-screens (NATIVE-4 W2): back chevron + title.
export function SubScreenHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View className="flex-row items-center gap-2 px-4 pt-2 pb-1">
      <Pressable
        onPress={() => router.back()}
        className="h-9 w-9 items-center justify-center rounded-full bg-card active:bg-secondary">
        <ArrowLeft size={18} color="#f5f1e8" />
      </Pressable>
      <Text className="font-display-bold text-title text-foreground">{title}</Text>
    </View>
  );
}
