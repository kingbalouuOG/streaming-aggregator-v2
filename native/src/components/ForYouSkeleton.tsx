import { useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SkeletonBlock, usePulse } from './Skeleton';

// For You loading skeleton — greeting + hero + two row placeholders, so the
// page's shape shows while the Worker payload computes, then the real
// composition fades in with the Reveal stagger. Shares the pulse + block
// primitives with Skeleton.tsx.

function SkeletonRow({ pulse }: { pulse: ReturnType<typeof usePulse> }) {
  return (
    <View className="mt-7">
      <View className="px-5">
        <SkeletonBlock pulse={pulse} style={{ width: 110, height: 10, borderRadius: 4 }} />
        <SkeletonBlock pulse={pulse} style={{ width: 210, height: 24, marginTop: 8 }} />
      </View>
      <View className="mt-3 flex-row gap-3 px-5">
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={i} pulse={pulse} style={{ width: 124, aspectRatio: 2 / 3 }} />
        ))}
      </View>
    </View>
  );
}

export function ForYouSkeleton() {
  const { width } = useWindowDimensions();
  const pulse = usePulse();

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']}>
        <View className="px-5 pb-1 pt-2">
          <SkeletonBlock pulse={pulse} style={{ width: 170, height: 12, borderRadius: 4 }} />
          <SkeletonBlock pulse={pulse} style={{ width: 230, height: 32, marginTop: 8 }} />
        </View>
      </SafeAreaView>

      {/* Hero block — matches the 4:5 MagazineHero footprint */}
      <SkeletonBlock pulse={pulse} style={{ width, height: (width * 5) / 4, marginTop: 8, borderRadius: 0 }} />

      <SkeletonRow pulse={pulse} />
      <SkeletonRow pulse={pulse} />
    </View>
  );
}
