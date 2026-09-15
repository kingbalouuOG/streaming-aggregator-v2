import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

// Top toast with an optional Undo (IN-SC-006 — the "I have this" confirmation
// on Where to Watch). The host screen owns the state and renders this last,
// absolutely positioned; a new toast replaces the current one and restarts
// the timer. `onDismiss` must be stable (useCallback) or the timer resets on
// every render.

export interface ToastState {
  message: string;
  onUndo?: () => void;
}

const VISIBLE_MS = 5000;

export function Toast({ toast, top, onDismiss }: { toast: ToastState | null; top: number; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(160)}
      pointerEvents="box-none"
      style={{ position: 'absolute', top, left: 16, right: 16, zIndex: 50, elevation: 50 }}>
      <View
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3"
        style={{ shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
        <Text className="flex-1 font-sans-medium text-body text-foreground">{toast.message}</Text>
        {toast.onUndo ? (
          <Pressable
            onPress={() => {
              toast.onUndo?.();
              onDismiss();
            }}
            hitSlop={8}
            accessibilityRole="button">
            <Text className="font-sans-bold text-body text-primary">Undo</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
