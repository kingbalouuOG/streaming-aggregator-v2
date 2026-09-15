import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, Check, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMarkUsernameChosen } from '@/hooks/useUsernameChosen';
import { isValidUsername, normaliseUsernameInput, suggestUsername } from '@/lib/auth/username';
import { supabase } from '@/lib/supabase';
import { clearProviderGivenName, peekProviderGivenName, useAuth } from '@/providers/auth';

// "Choose your name" (Growth S3, decision D8). Shown once to an account whose
// profiles.username is still the migration-089 placeholder, i.e. an Apple or
// Google sign-up. Two entry points:
//  - the end of onboarding (OnboardingFlow → ?next=curating), so Curating
//    and the pending link it resumes run on a finished account;
//  - the (tabs) guard, for anyone who left before choosing.
// A full-screen step, not a dismissible modal: it is reached by a replace
// with nothing beneath it, and swiping it away would only land back on the
// guard that sent the user here.
//
// Prefilled from the provider's given name when this session captured one
// (Apple sends it on the first authorisation only). The placeholder itself
// is never shown. Saving writes profiles (username + username_chosen, the
// UNIQUE constraint is the final say on "taken") and then
// user_metadata.username, which is what every screen displays
// (ProfileAccount.tsx writes the same field).

const MUTED = 'rgba(245,241,232,0.62)';

export default function ChooseUsernameScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { session, checkUsernameAvailable } = useAuth();
  const markUsernameChosen = useMarkUsernameChosen();
  const userId = session?.user?.id;

  const [username, setUsername] = useState(() => normaliseUsernameInput(suggestUsername(peekProviderGivenName())));
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = isValidUsername(username);
  const canSubmit = valid && status !== 'taken' && status !== 'checking' && !!userId;

  // Same debounced availability check as onboarding Step 1. A transient RPC
  // error leaves 'idle' and does not block: the save's UNIQUE check decides.
  useEffect(() => {
    if (!valid) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const free = await checkUsernameAvailable(username);
        if (!cancelled) setStatus(free ? 'available' : 'taken');
      } catch {
        if (!cancelled) setStatus('idle');
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, valid]);

  const save = async () => {
    if (!canSubmit || busy || !userId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ username, username_chosen: true, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (profileError) {
        if (profileError.code === '23505') setStatus('taken');
        else setError("Couldn't save your name. Check your connection and try again.");
        return;
      }
      const { error: metadataError } = await supabase.auth.updateUser({ data: { username } });
      if (metadataError) {
        // profiles already holds the name, so a retry re-saves the same row.
        setError("Couldn't save your name. Check your connection and try again.");
        return;
      }
      clearProviderGivenName();
      markUsernameChosen(userId);
      router.replace(next === 'curating' ? '/curating' : '/');
    } finally {
      setBusy(false);
    }
  };

  const border = username.length === 0 ? 'border-border' : valid && status !== 'taken' ? 'border-success/50' : 'border-danger/60';

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="grow px-6 pt-10 pb-6" keyboardShouldPersistTaps="handled">
          <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">One last thing</Text>
          <Text className="mt-2 font-hero text-[40px] leading-[44px] text-foreground">Choose your name.</Text>
          <Text className="mt-2 font-sans text-body text-muted-foreground">
            This is how Videx greets you. You can change it later in Profile.
          </Text>

          <View className={`mt-8 flex-row items-center gap-3 rounded-card border ${border} bg-card px-4 py-3.5`}>
            <User size={18} color={MUTED} />
            <TextInput
              value={username}
              onChangeText={(raw) => setUsername(normaliseUsernameInput(raw))}
              placeholder="Username"
              placeholderTextColor="rgba(245,241,232,0.4)"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={username.length === 0}
              returnKeyType="done"
              onSubmitEditing={save}
              className="flex-1 font-sans text-body text-foreground"
            />
            {status === 'checking' ? (
              <ActivityIndicator size="small" color={MUTED} />
            ) : status === 'available' ? (
              <Check size={18} color="#10b981" />
            ) : null}
          </View>

          {status === 'taken' ? (
            <Text className="mt-1.5 font-sans text-meta text-danger">That username is taken — try another.</Text>
          ) : (
            <Text className="mt-1.5 font-sans text-meta text-muted-foreground">
              3–20 characters: letters, numbers, dots and underscores.
            </Text>
          )}

          {error ? <Text className="mt-3 font-sans text-meta text-danger">{error}</Text> : null}

          <Pressable
            onPress={save}
            disabled={!canSubmit || busy}
            className={
              canSubmit && !busy
                ? 'mt-6 h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90'
                : 'mt-6 h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary/40'
            }>
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text className="font-sans-bold text-section text-white">Continue</Text>
                <ArrowRight size={20} color="#ffffff" />
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
