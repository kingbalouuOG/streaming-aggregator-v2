import type { PropsWithChildren } from 'react';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

// Staged entrance — port of the web <Reveal index> (UX-1 W6): fade +
// 14px rise, 60ms stagger, M3 decelerate. Late-arriving sections join
// the same motion, so staggered loading reads as choreography.
const M3_DECELERATE = Easing.bezier(0.05, 0.7, 0.1, 1.0);

export function Reveal({ index = 0, children }: PropsWithChildren<{ index?: number }>) {
  return (
    <Animated.View
      entering={FadeInDown.duration(210)
        .delay(index * 60)
        .easing(M3_DECELERATE.factory())
        .withInitialValues({ transform: [{ translateY: 14 }] })}>
      {children}
    </Animated.View>
  );
}
