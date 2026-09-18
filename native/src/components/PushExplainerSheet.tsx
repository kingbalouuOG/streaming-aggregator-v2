import { useFocusEffect } from 'expo-router';
import { BellRing } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  acceptPushPrompt,
  declinePushPrompt,
  getPushPromptDecision,
  registerPushToken,
} from '@/notifications/push';
import { readPendingLink } from '@/pendingLink';
import { useAuth } from '@/providers/auth';

// Notification explainer (IN-GR-034, Growth S5). The one automatic ask for
// notification permission: a bottom sheet on For You, shown once per install
// and account, before the OS prompt ever appears. Replaces the old "first
// watchlist add" trigger, which most new installs never reached.
//
// Timing: For You renders this only once its payload has loaded, and For
// You must then stay FOCUSED for SETTLE_MS. That covers both entry points
// without a signal of their own:
//  - end of onboarding: curating.tsx replaces to For You, then pushes a
//    pending shared link a tick later, which blurs For You and cancels the
//    timer; the explainer shows when the person comes back from the title.
//  - existing installs never asked: their next For You visit.
// The rule itself (granted / blocked / asked / declined / pending link) is
// the pure decidePushPrompt in src/lib/notifications/promptDecision.ts.
// Sheet chrome matches EditorNoteSheet / ReportSheet.

const SETTLE_MS = 1200;

export function PushExplainerHost() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  // The account this mount has already decided for: one check per For You
  // mount, not one per focus, once a decision other than 'wait' is made.
  const decidedFor = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId || decidedFor.current === userId) return;
      let active = true;
      const timer = setTimeout(async () => {
        const decision = await getPushPromptDecision(userId, readPendingLink() !== null);
        // Blurred (a shared title was pushed) while deciding: ask on return.
        if (!active || decision === 'wait') return;
        decidedFor.current = userId;
        if (decision === 'explain') setVisible(true);
        else if (decision === 'register') void registerPushToken(userId);
      }, SETTLE_MS);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [userId]),
  );

  const onTurnOn = async () => {
    if (!userId || busy) return;
    setBusy(true);
    // Close first so the system dialog is not stacked over the sheet.
    setVisible(false);
    try {
      await acceptPushPrompt(userId);
    } finally {
      setBusy(false);
    }
  };

  const onNotNow = () => {
    setVisible(false);
    void declinePushPrompt();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onNotNow}>
      <View className="flex-1 justify-end bg-black/70">
        <SafeAreaView edges={['bottom']} className="rounded-t-[20px]" style={{ backgroundColor: '#13131a' }}>
          {/* grabber */}
          <View className="items-center pt-3">
            <View style={{ width: 38, height: 4, borderRadius: 999, backgroundColor: 'rgba(245,241,232,0.18)' }} />
          </View>

          <View className="px-5 pb-6 pt-5">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft">
              <BellRing size={20} color="#ff8d5a" />
            </View>
            <Text className="mt-4 font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
              Alerts
            </Text>
            <Text className="mt-1 font-display text-section text-foreground">Know when it lands.</Text>
            <Text className="mt-2 font-sans text-body leading-6 text-muted-foreground">
              Get told when something on your watchlist lands on your services, or is about to leave.
            </Text>
            <Text className="mt-2 font-sans text-meta leading-5 text-faint-foreground">
              At most about once a day. You can change this any time in Profile.
            </Text>

            <Pressable
              onPress={onTurnOn}
              disabled={busy}
              accessibilityRole="button"
              className="mt-6 items-center rounded-card bg-primary py-3.5 active:opacity-90">
              <Text className="font-sans-bold text-body text-white">Turn on</Text>
            </Pressable>
            <Pressable
              onPress={onNotNow}
              accessibilityRole="button"
              className="mt-2 items-center rounded-card py-3.5 active:bg-secondary">
              <Text className="font-sans-medium text-body text-muted-foreground">Not now</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
