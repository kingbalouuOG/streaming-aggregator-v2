import { Check, Send, Star, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

// FeedbackSheet — the in-app feedback loop form (native feedback feature).
// Optional 1–5 rating + a required free-text message, written to the
// app_feedback table (migration 047) under the signed-in user. Surfaced two
// ways: a one-time timed prompt (useFeedbackPrompt) and Profile → Send
// feedback. `surface` is stored in context for triage.

const GOLD = '#e3b04b';

export function FeedbackSheet({
  visible,
  surface,
  onClose,
}: {
  visible: boolean;
  surface: 'auto_prompt' | 'profile';
  onClose: () => void;
}) {
  const { session } = useAuth();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kbHeight, setKbHeight] = useState(0);

  // Reset the form each time the sheet opens so a prior submission doesn't
  // linger when it's reopened.
  useEffect(() => {
    if (visible) {
      setRating(0);
      setMessage('');
      setBusy(false);
      setDone(false);
      setError(null);
    }
  }, [visible]);

  // Lift the sheet above the keyboard. KeyboardAvoidingView is a no-op on
  // Android inside a Modal, so track the keyboard height and add it as the
  // sheet's marginBottom — the bottom-anchored sheet rises to sit on top.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKbHeight(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const canSubmit = message.trim().length >= 3 && !busy;

  const submit = async () => {
    const userId = session?.user?.id;
    if (!canSubmit || !userId) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from('app_feedback').insert({
      user_id: userId,
      message: message.trim(),
      rating: rating > 0 ? rating : null,
      context: { surface, platform: 'native' },
    });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setDone(true);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/70">
        <SafeAreaView
          edges={['bottom']}
          className="rounded-t-[20px]"
          style={{ backgroundColor: '#13131a', marginBottom: kbHeight }}>
          <View className="items-center pt-3">
            <View style={{ width: 38, height: 4, borderRadius: 999, backgroundColor: 'rgba(245,241,232,0.18)' }} />
          </View>

          {done ? (
            <View className="items-center px-6 pb-8 pt-6">
              <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-soft">
                <Check size={26} color="#e85d25" strokeWidth={2.5} />
              </View>
              <Text className="mt-4 font-display-bold text-title text-foreground">Thank you.</Text>
              <Text className="mt-1.5 text-center font-sans text-body text-muted-foreground">
                Your note went straight to the team. It genuinely shapes what we build next.
              </Text>
              <Pressable
                onPress={onClose}
                className="mt-6 h-12 w-full items-center justify-center rounded-card bg-primary active:opacity-90">
                <Text className="font-sans-bold text-body text-white">Done</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                className="flex-row items-start justify-between px-5 pb-3 pt-3"
                style={{ borderBottomWidth: 0.5, borderBottomColor: 'rgba(245,241,232,0.10)' }}>
                <View className="flex-1 pr-3">
                  <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
                    We&apos;re listening
                  </Text>
                  <Text className="mt-0.5 font-display-bold text-title text-foreground">Send feedback.</Text>
                </View>
                <Pressable onPress={onClose} hitSlop={8} className="mt-1">
                  <X size={20} color="rgba(245,241,232,0.62)" />
                </Pressable>
              </View>

              <View className="px-5 pb-3 pt-4">
                <Text className="font-sans text-body text-muted-foreground">
                  How&apos;s Videx feeling so far? Tell us what&apos;s working, what isn&apos;t, or what&apos;s missing.
                </Text>

                {/* Optional rating */}
                <Text className="mb-2 mt-5 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
                  Rating (optional)
                </Text>
                <View className="flex-row gap-2">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const on = n <= rating;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => setRating((r) => (r === n ? 0 : n))}
                        hitSlop={6}
                        className="active:opacity-70">
                        <Star size={30} color={GOLD} fill={on ? GOLD : 'transparent'} strokeWidth={on ? 0 : 1.6} />
                      </Pressable>
                    );
                  })}
                </View>

                {/* Message */}
                <Text className="mb-2 mt-5 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
                  Your feedback
                </Text>
                <View className="rounded-card border border-border bg-background px-4 py-3">
                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder="What's working, what's not, what's missing?"
                    placeholderTextColor="rgba(245,241,232,0.4)"
                    multiline
                    numberOfLines={4}
                    maxLength={2000}
                    textAlignVertical="top"
                    className="min-h-[88px] font-sans text-body text-foreground"
                  />
                </View>

                {error ? <Text className="mt-3 font-sans text-meta text-danger">{error}</Text> : null}

                <Pressable
                  onPress={submit}
                  disabled={!canSubmit}
                  className={
                    canSubmit
                      ? 'mt-5 h-12 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90'
                      : 'mt-5 h-12 flex-row items-center justify-center gap-2 rounded-card bg-primary/40'
                  }>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Send size={15} color="#fff" strokeWidth={2} />
                      <Text className="font-sans-bold text-body text-white">Send feedback</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
