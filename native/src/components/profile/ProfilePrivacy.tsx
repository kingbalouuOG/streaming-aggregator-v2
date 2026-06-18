import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/providers/auth';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Privacy & Data (web PrivacyDataPage). Intro + what-Videx-learns +
// type-username-to-confirm account deletion. (Privacy/Terms links + data
// export are deferred — export needs a native-share path, not web's <a>.)

const TRACK = [
  'What you rate (thumbs up / down)',
  'What you add to your watchlist',
  'What you mark as watched',
  'Titles you mark as not interested',
  'Which services you tap to watch',
  'Titles you view, and how long for',
  'Your genre and taste preferences',
  'Your streaming subscriptions',
];
const NO_TRACK = [
  'Your location',
  'Your other apps',
  'Anything outside Videx',
  'Your actual viewing on the platforms',
];

export function ProfilePrivacy() {
  const { session, deleteAccount } = useAuth();
  const username =
    ((session?.user?.user_metadata?.username as string | undefined) ?? '') ||
    session?.user?.email?.split('@')[0] ||
    '';

  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = username.length > 0 && confirm.trim().toLowerCase() === username.trim().toLowerCase();

  const doDelete = async () => {
    if (!canDelete || busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await deleteAccount();
    setBusy(false);
    if (e) setError(e);
    // Success ends the session → the app routes back to auth automatically.
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Privacy & Data" />
      <ScrollView contentContainerClassName="px-5 pb-6 pt-3">
        <Text className="font-sans text-body leading-relaxed text-muted-foreground">
          Videx learns from what you watch, rate, and explore to recommend titles that match your
          taste. We never sell this data or share it with other services.
        </Text>

        <Text className="mb-2 mt-6 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
          What Videx learns
        </Text>
        <View className="rounded-card border border-border bg-card p-4">
          <Text className="font-sans-bold text-body text-foreground">We track</Text>
          {TRACK.map((t) => (
            <Text key={t} className="mt-1.5 font-sans text-meta text-muted-foreground">
              •  {t}
            </Text>
          ))}
          <Text className="mt-4 font-sans-bold text-body text-foreground">We don&apos;t track</Text>
          {NO_TRACK.map((t) => (
            <Text key={t} className="mt-1.5 font-sans text-meta text-muted-foreground">
              •  {t}
            </Text>
          ))}
        </View>

        <Pressable
          onPress={() => {
            setOpen(true);
            setConfirm('');
            setError(null);
          }}
          className="mt-6 flex-row items-center gap-3 rounded-card border border-destructive/40 bg-destructive/10 p-4 active:bg-destructive/20">
          <Trash2 size={18} color="#d4183d" />
          <Text className="font-sans-bold text-body text-destructive">Delete my account</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <View className="flex-1 items-center justify-center bg-black/70 px-8">
          <View className="w-full rounded-card p-5" style={{ backgroundColor: '#13131a' }}>
            <Text className="font-display-bold text-title text-foreground">Delete account?</Text>
            <Text className="mt-2 font-sans text-body leading-relaxed text-muted-foreground">
              This permanently deletes your account, preferences, watchlist, and ratings. This can&apos;t
              be undone.
            </Text>
            <Text className="mt-4 font-sans-medium text-meta text-muted-foreground">
              Type your username to confirm
            </Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder={username}
              placeholderTextColor="rgba(245,241,232,0.4)"
              autoCapitalize="none"
              autoCorrect={false}
              className="mt-1.5 rounded-card border border-border bg-background px-3 py-2.5 font-sans text-body text-foreground"
            />
            {error ? <Text className="mt-2 font-sans text-meta text-danger">{error}</Text> : null}
            <View className="mt-4 flex-row gap-3">
              <Pressable
                onPress={() => setOpen(false)}
                disabled={busy}
                className="h-11 flex-1 items-center justify-center rounded-card border border-border active:bg-secondary">
                <Text className="font-sans-bold text-body text-muted-foreground">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={doDelete}
                disabled={!canDelete || busy}
                className={
                  canDelete && !busy
                    ? 'h-11 flex-1 items-center justify-center rounded-card bg-destructive active:opacity-90'
                    : 'h-11 flex-1 items-center justify-center rounded-card bg-destructive/30'
                }>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="font-sans-bold text-body text-white">Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
