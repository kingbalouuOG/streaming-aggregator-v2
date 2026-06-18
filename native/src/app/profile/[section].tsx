import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileAccount } from '@/components/profile/ProfileAccount';
import { ProfileAppearance } from '@/components/profile/ProfileAppearance';
import { ProfilePrivacy } from '@/components/profile/ProfilePrivacy';
import { ProfileServices } from '@/components/profile/ProfileServices';
import { ProfileSpend } from '@/components/profile/ProfileSpend';
import { ProfileTaste } from '@/components/profile/ProfileTaste';
import { ProfileTune } from '@/components/profile/ProfileTune';

// Profile sub-screen router (NATIVE-4). Maps the section param to its
// screen. Every known section has a real screen (Monthly Spend + Privacy &
// Data shipped post-NATIVE-4); Stub() only catches unknown sections.
export default function ProfileSectionRoute() {
  const { section } = useLocalSearchParams<{ section: string }>();

  switch (section) {
    case 'account':
      return <ProfileAccount />;
    case 'services':
      return <ProfileServices />;
    case 'taste':
      return <ProfileTaste />;
    case 'tune':
      return <ProfileTune />;
    case 'appearance':
      return <ProfileAppearance />;
    case 'spend':
      return <ProfileSpend />;
    case 'privacy':
      return <ProfilePrivacy />;
    default:
      return <Stub />;
  }
}

// Fallback for an unrecognised section (every known one routes above).
function Stub() {
  const router = useRouter();
  const title = 'Settings';
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
        <Text className="text-center font-sans text-body text-muted-foreground">Coming soon.</Text>
      </View>
    </SafeAreaView>
  );
}
