import { Check, CircleAlert } from 'lucide-react-native';
import { useEffect, type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PullToRefresh } from '@/hooks/usePullToRefresh';

// Vertical ScrollView for the feed tabs with a pull-to-refresh indicator
// that stays visible (IN-UX-002).
//
// WHY iOS DOES NOT USE THE NATIVE SPINNER. The tabs have no header and New's
// MagazineHero is deliberately full-bleed under the status bar, so the
// scroll view starts at the top of the screen. UIRefreshControl draws in the
// ~60pt band it opens above the content, which on a Dynamic Island phone
// sits almost entirely under the island: half a spinner. RN 0.85 does honour
// `progressViewOffset` on iOS (it shifts the control's bounds), but the
// control is attached as the scroll view's `refreshControl`, behind the
// content, so moving it down only hides it behind the hero instead. So the
// native control is kept for what it does well, the pull gesture and holding
// the content open, with its tint cleared, and the spinner is drawn here as
// an overlay chip just below the safe area.
//
// Android's SwipeRefreshLayout draws its disc ABOVE the content and honours
// `progressViewOffset`, so it stays native, offset below the status bar.

const PRIMARY = '#e85d25';
const CARD = '#14141c';

/** Gap between the safe-area top and the chip / cue. */
const INDICATOR_GAP = 8;
/** Pull distance over which the iOS chip fades in. */
const PULL_REVEAL = 48;

const isIOS = Platform.OS === 'ios';

interface Props {
  refresh: PullToRefresh;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function RefreshableScrollView({
  refresh,
  contentContainerStyle,
  children,
}: PropsWithChildren<Props>) {
  const insets = useSafeAreaInsets();
  const { refreshing, cue, onRefresh } = refresh;
  const top = insets.top + INDICATOR_GAP;

  // iOS keeps the control open while the cue shows, so the "Updated" pill
  // takes the spinner's place in the gap above the content and the page
  // settles back only once it has been read. Without the hold the pill
  // would land on top of the hero's kicker as the content sprang back.
  // Android's disc overlays rather than pushes, so there is nothing to hold.
  const holdOpen = refreshing || (isIOS && cue !== null);

  const pull = useSharedValue(0);
  const dragging = useSharedValue(false);
  const spinning = useSharedValue(false);

  useEffect(() => {
    spinning.set(refreshing);
  }, [refreshing, spinning]);

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      dragging.set(true);
    },
    onEndDrag: () => {
      dragging.set(false);
    },
    onScroll: (e) => {
      pull.set(Math.max(0, -e.contentOffset.y));
    },
  });

  // Tracks the finger while pulling, pinned on while refreshing, and off
  // otherwise — so neither a flick's top bounce nor the content springing
  // back after a refresh flashes the chip.
  const chipStyle = useAnimatedStyle(() => {
    if (spinning.get()) return { opacity: 1, transform: [{ scale: 1 }] };
    if (!dragging.get()) return { opacity: 0, transform: [{ scale: 0.6 }] };
    const progress = interpolate(pull.get(), [0, PULL_REVEAL], [0, 1], Extrapolation.CLAMP);
    return { opacity: progress, transform: [{ scale: 0.6 + 0.4 * progress }] };
  });

  return (
    <View style={styles.fill}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={contentContainerStyle}
        refreshControl={
          <RefreshControl
            refreshing={holdOpen}
            onRefresh={onRefresh}
            // iOS: the chip below replaces the native spinner.
            tintColor="transparent"
            // Android: native disc, below the status bar.
            colors={[PRIMARY]}
            progressBackgroundColor={CARD}
            progressViewOffset={isIOS ? undefined : top}
          />
        }>
        {children}
      </Animated.ScrollView>

      <View style={[styles.overlay, { top }]}>
        {isIOS && !cue ? (
          <Animated.View style={chipStyle}>
            <View className="h-9 w-9 items-center justify-center rounded-pill border border-border bg-card">
              <ActivityIndicator color={PRIMARY} />
            </View>
          </Animated.View>
        ) : null}

        {cue ? (
          <Animated.View key={cue.key} entering={FadeIn.duration(180)} exiting={FadeOut.duration(180)}>
            <View
              accessibilityRole="alert"
              className="h-9 flex-row items-center gap-1.5 rounded-pill border border-border bg-card px-3.5">
              {cue.outcome === 'failed' ? (
                <CircleAlert size={14} color={PRIMARY} strokeWidth={2} />
              ) : (
                <Check size={14} color={PRIMARY} strokeWidth={2.4} />
              )}
              <Text className="font-sans-medium text-meta text-foreground">{cue.message}</Text>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
});
