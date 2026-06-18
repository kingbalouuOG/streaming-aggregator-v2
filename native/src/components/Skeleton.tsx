import { useEffect, useRef } from 'react';
import { Animated, useWindowDimensions, View } from 'react-native';

// Shared loading-skeleton primitives. A single pulsing-opacity loop drives
// neutral placeholder blocks so loading states across the app (For You,
// Browse search/mood, Detail) read as "working", not broken or frozen.

const TINT = 'rgba(245,241,232,0.07)';

export function usePulse() {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

export function SkeletonBlock({ pulse, style }: { pulse: Animated.Value; style: object }) {
  return <Animated.View style={[{ backgroundColor: TINT, borderRadius: 10, opacity: pulse }, style]} />;
}

/** 2-column poster-grid skeleton — Browse search / mood / filter loading.
 *  Mirrors the FlashList grid (padding 14, 2 columns) so the real results
 *  drop straight into the same rhythm. */
export function PosterGridSkeleton() {
  const pulse = usePulse();
  const { width } = useWindowDimensions();
  const colW = (width - 14 * 2 - 12) / 2;
  return (
    <View style={{ padding: 14 }}>
      {[0, 1, 2, 3].map((r) => (
        <View key={r} className="flex-row" style={{ gap: 12, marginBottom: 14 }}>
          {[0, 1].map((c) => (
            <View key={c} style={{ width: colW }}>
              <SkeletonBlock pulse={pulse} style={{ width: colW, aspectRatio: 2 / 3, borderRadius: 12 }} />
              <SkeletonBlock pulse={pulse} style={{ width: colW * 0.82, height: 12, marginTop: 8, borderRadius: 4 }} />
              <SkeletonBlock pulse={pulse} style={{ width: colW * 0.5, height: 10, marginTop: 6, borderRadius: 4 }} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Detail-page loading skeleton — hero block + meta/ratings/CTA/description
 *  placeholders. Replaces the old "paint the card poster full-size, then swap
 *  to the backdrop" flash: the hero is a neutral block, so the real backdrop
 *  just fades in over nothing jarring. */
export function DetailSkeleton() {
  const pulse = usePulse();
  const { width } = useWindowDimensions();
  const heroHeight = (width * 5) / 4;
  return (
    <View className="flex-1 bg-background">
      <SkeletonBlock pulse={pulse} style={{ width, height: heroHeight, borderRadius: 0 }} />
      <View className="px-5 pt-5">
        <SkeletonBlock pulse={pulse} style={{ width: 210, height: 14, borderRadius: 4 }} />
        <View className="mt-3 flex-row" style={{ gap: 10 }}>
          <SkeletonBlock pulse={pulse} style={{ width: 74, height: 32, borderRadius: 8 }} />
          <SkeletonBlock pulse={pulse} style={{ width: 74, height: 32, borderRadius: 8 }} />
        </View>
        <SkeletonBlock pulse={pulse} style={{ width: '100%', height: 46, marginTop: 16, borderRadius: 12 }} />
        <SkeletonBlock pulse={pulse} style={{ width: '100%', height: 12, marginTop: 18, borderRadius: 4 }} />
        <SkeletonBlock pulse={pulse} style={{ width: '92%', height: 12, marginTop: 8, borderRadius: 4 }} />
        <SkeletonBlock pulse={pulse} style={{ width: '55%', height: 12, marginTop: 8, borderRadius: 4 }} />
      </View>
    </View>
  );
}
