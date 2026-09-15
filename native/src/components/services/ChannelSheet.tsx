import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ServiceBadge } from '@/components/ServiceBadge';
import type { ChannelChoice } from '@/lib/entitlements/channels';
import type { ServiceId } from '@/lib/types/content';
import { channelWord, isServiceId } from './channelCopy';

// Channel sheet — one per parent (IN-SC-006, services picker Direction B).
// "Which channels have you added?" for Prime Video / Apple TV+ / NOW.
//
// Ticks apply straight to the picker's local state — there is no cancel, so
// Done, swipe-down and a backdrop tap all simply close. Built on RN core
// Animated + PanResponder rather than gesture-handler: it needs no
// GestureHandlerRootView (none is mounted in this app, and Modals need
// their own), and it stays JS-only so it ships over the air.

const SHEET_BG = '#111118';
// --vx-ease-snap cubic-bezier(.2, .8, .2, 1), 250ms (tokens.css).
const EASE_SNAP = Easing.bezier(0.2, 0.8, 0.2, 1);
const DURATION_MS = 250;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.8;

interface ChannelSheetProps {
  open: boolean;
  parent: ServiceId;
  parentName: string;
  choices: ChannelChoice[];
  failed: boolean;
  isOn: (choice: ChannelChoice) => boolean;
  onToggle: (choice: ChannelChoice) => void;
  onRetry: () => void;
  onClose: () => void;
}

export function ChannelSheet({
  open,
  parent,
  parentName,
  choices,
  failed,
  isOn,
  onToggle,
  onRetry,
  onClose,
}: ChannelSheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = Math.min(640, windowHeight - insets.top - 24);

  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);

  // The pan responder is created once; read the latest onClose through a ref.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timing = (value: Animated.Value, toValue: number) =>
      Animated.timing(value, { toValue, duration: DURATION_MS, easing: EASE_SNAP, useNativeDriver: true });
    if (open) {
      setMounted(true);
      translateY.setValue(sheetHeight);
      Animated.parallel([timing(translateY, 0), timing(backdrop, 1)]).start();
    } else {
      Animated.parallel([timing(translateY, sheetHeight), timing(backdrop, 0)]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, sheetHeight, translateY, backdrop]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          onCloseRef.current();
        } else {
          Animated.timing(translateY, {
            toValue: 0,
            duration: DURATION_MS,
            easing: EASE_SNAP,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const heldCount = choices.filter(isOn).length;
  const plural = channelWord(parent, 2);
  const cta = failed ? 'Close' : heldCount > 0 ? `Done · ${heldCount} ${channelWord(parent, heldCount)}` : 'None of these';

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Animated.View
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', opacity: backdrop }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>

        <Animated.View
          style={{
            height: sheetHeight,
            backgroundColor: SHEET_BG,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            overflow: 'hidden',
            transform: [{ translateY }],
          }}>
          <View {...pan.panHandlers}>
            <View className="items-center pt-3">
              <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: 'rgba(245,241,232,0.20)' }} />
            </View>
            <View className="px-5 pb-3 pt-3">
              <View className="flex-row items-center gap-3">
                <ServiceBadge service={parent} size="md" />
                <View className="flex-1">
                  <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
                    Inside {parentName}
                  </Text>
                  <Text className="mt-0.5 font-title text-[20px] leading-6 text-foreground">
                    Which {plural} have you added?
                  </Text>
                </View>
              </View>
              <Text className="mt-2 font-sans text-[12px] leading-4 text-muted-foreground">
                Bought separately inside the {parentName} app. Skip if you&apos;re not sure — most people have none.
              </Text>
            </View>
          </View>

          {failed ? (
            <View className="mx-5 mt-2 rounded-card border border-border bg-card p-4">
              <Text className="font-sans-bold text-body text-foreground">Couldn&apos;t load {plural}</Text>
              <Text className="mt-1 font-sans text-meta text-muted-foreground">
                Your {parentName} pick is saved. Try again in a moment.
              </Text>
              <Pressable
                onPress={onRetry}
                accessibilityRole="button"
                className="mt-3 min-h-[32px] justify-center self-start rounded-pill border border-primary-edge px-4 active:opacity-80">
                <Text className="font-sans-bold text-[12px] text-primary">Retry</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 120 + insets.bottom }}
              showsVerticalScrollIndicator={false}>
              {choices.map((choice, i) => {
                const on = isOn(choice);
                const service =
                  choice.standaloneServiceId && isServiceId(choice.standaloneServiceId)
                    ? choice.standaloneServiceId
                    : null;
                return (
                  <Pressable
                    key={choice.channelId}
                    onPress={() => onToggle(choice)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${choice.displayName}, ${channelWord(parent, 1)} in ${parentName}`}
                    className="min-h-[52px] flex-row items-center gap-3 px-3 py-2.5 active:opacity-70"
                    style={i > 0 ? { borderTopWidth: 0.5, borderTopColor: 'rgba(245,241,232,0.10)' } : undefined}>
                    {service ? <ServiceBadge service={service} size="sm" /> : <Monogram name={choice.displayName} />}
                    <View className="flex-1">
                      <Text className="font-sans-bold text-[14px] text-foreground">{choice.displayName}</Text>
                      {service ? (
                        <Text className="mt-0.5 font-sans text-[11px] text-faint-foreground">
                          Also a service · one tick counts everywhere
                        </Text>
                      ) : null}
                    </View>
                    <CheckCircle on={on} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <LinearGradient
            colors={['rgba(17,17,24,0)', SHEET_BG]}
            locations={[0, 0.35]}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 20,
              paddingTop: 28,
              paddingBottom: insets.bottom + 12,
            }}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              className="h-[52px] items-center justify-center rounded-lg bg-primary active:opacity-90">
              <Text className="font-sans-bold text-section text-white">{cta}</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Monogram({ name }: { name: string }) {
  return (
    <View className="h-7 w-7 items-center justify-center rounded-md bg-secondary">
      <Text className="font-card text-[13px] text-foreground">{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function CheckCircle({ on }: { on: boolean }) {
  return on ? (
    <View className="h-[22px] w-[22px] items-center justify-center rounded-full bg-primary">
      <Check size={13} color="#ffffff" strokeWidth={3} />
    </View>
  ) : (
    <View className="h-[22px] w-[22px] rounded-full border-2 border-border" />
  );
}
