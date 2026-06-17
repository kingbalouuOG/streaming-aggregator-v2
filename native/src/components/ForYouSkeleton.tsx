import { useEffect, useRef } from 'react';
import { Animated, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// For You loading skeleton. The Worker payload takes a beat to compute
// (recommendation pipeline), so show the page's shape — greeting, hero,
// fingerprint, two rows — pulsing, instead of a bare spinner. Once data
// lands the real composition fades in with the Reveal stagger.

const TINT = 'rgba(245,241,232,0.07)';

function Block({ style, pulse }: { style: object; pulse: Animated.Value }) {
  return <Animated.View style={[{ backgroundColor: TINT, borderRadius: 10, opacity: pulse }, style]} />;
}

function SkeletonRow({ pulse }: { pulse: Animated.Value }) {
  return (
    <View className="mt-7">
      <View className="px-5">
        <Block pulse={pulse} style={{ width: 110, height: 10, borderRadius: 4 }} />
        <Block pulse={pulse} style={{ width: 210, height: 24, marginTop: 8 }} />
      </View>
      <View className="mt-3 flex-row gap-3 px-5">
        {[0, 1, 2].map((i) => (
          <Block key={i} pulse={pulse} style={{ width: 124, aspectRatio: 2 / 3 }} />
        ))}
      </View>
    </View>
  );
}

export function ForYouSkeleton() {
  const { width } = useWindowDimensions();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']}>
        <View className="px-5 pb-1 pt-2">
          <Block pulse={pulse} style={{ width: 170, height: 12, borderRadius: 4 }} />
          <Block pulse={pulse} style={{ width: 230, height: 32, marginTop: 8 }} />
        </View>
      </SafeAreaView>

      {/* Hero block — matches the 4:5 MagazineHero footprint */}
      <Block pulse={pulse} style={{ width, height: (width * 5) / 4, marginTop: 8, borderRadius: 0 }} />

      <SkeletonRow pulse={pulse} />
      <SkeletonRow pulse={pulse} />
    </View>
  );
}
