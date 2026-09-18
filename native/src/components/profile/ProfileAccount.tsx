import { Check, Mail, User } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUsernameSave } from '@/hooks/useUsernameSave';
import { normaliseUsernameInput } from '@/lib/auth/username';
import { useAuth } from '@/providers/auth';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Account Details (NATIVE-4 W2; Track-2: editable). Email is
// read-only — changing it needs a verification flow (deferred).
//
// Growth S3 follow-up (IN-GR-013): a username change follows the same rules
// and order as "Choose your name" (choose-username.tsx): the shared format
// check, a debounced username_available check, then profiles first (its
// UNIQUE constraint is the final word on "taken"), then
// user_metadata.username, which every screen displays and which flows back
// through onAuthStateChange. Before, only user_metadata changed, so profiles
// kept the old name: it stayed "taken" and two people could show the same one.
// The check and save live in hooks/useUsernameSave.ts, shared with that screen.

const MUTED = 'rgba(245,241,232,0.62)';

export function ProfileAccount() {
  const { session } = useAuth();
  const user = session?.user;
  const email = user?.email ?? '';
  const initialName = ((user?.user_metadata?.username as string | undefined) ?? '') || email.split('@')[0] || 'You';
  const created = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null;

  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(false);

  const changed = name !== initialName;
  // Same debounced availability check and save as "Choose your name".
  const { status, busy, error, valid, canSubmit: canSave, save: saveUsername } = useUsernameSave({
    username: name,
    userId: user?.id,
    enabled: changed,
    failureMessage: "Couldn't save your username. Check your connection and try again.",
    onSaved: () => setSaved(true),
  });

  const save = () => {
    if (!canSave || busy) return;
    setSaved(false);
    void saveUsername();
  };

  const border = !changed ? 'border-border' : valid && status !== 'taken' ? 'border-success/50' : 'border-danger/60';

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Account Details" />
      <ScrollView contentContainerClassName="px-5 pb-4 pt-3" keyboardShouldPersistTaps="handled">
        <Text className="mb-1.5 font-sans text-kicker uppercase tracking-[1.6px] text-muted-foreground">Username</Text>
        <View className={`flex-row items-center gap-3 rounded-card border ${border} bg-card px-4 py-3.5`}>
          <User size={18} color={MUTED} />
          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(normaliseUsernameInput(t));
              setSaved(false);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 font-sans-medium text-body text-foreground"
          />
          {status === 'checking' ? (
            <ActivityIndicator size="small" color={MUTED} />
          ) : status === 'available' ? (
            <Check size={18} color="#10b981" />
          ) : null}
        </View>
        {status === 'taken' ? (
          <Text className="mt-1.5 font-sans text-meta text-danger">That username is taken — try another.</Text>
        ) : changed && !valid ? (
          <Text className="mt-1.5 font-sans text-meta text-muted-foreground">
            3–20 characters: letters, numbers, dots and underscores.
          </Text>
        ) : null}

        <Text className="mb-1.5 mt-4 font-sans text-kicker uppercase tracking-[1.6px] text-muted-foreground">Email</Text>
        <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5">
          <Mail size={18} color={MUTED} />
          <Text className="flex-1 font-sans-medium text-body text-muted-foreground">{email}</Text>
        </View>

        <Pressable
          onPress={save}
          disabled={!canSave || busy}
          className={
            canSave && !busy
              ? 'mt-5 h-12 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90'
              : 'mt-5 h-12 flex-row items-center justify-center gap-2 rounded-card bg-primary/40'
          }>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Check size={16} color="#fff" />
              <Text className="font-sans-bold text-body text-white">Save changes</Text>
            </>
          )}
        </Pressable>
        {error ? <Text className="mt-3 text-center font-sans text-meta text-danger">{error}</Text> : null}
        {saved ? <Text className="mt-3 text-center font-sans text-meta text-success">Saved.</Text> : null}

        {created ? (
          <Text className="mt-5 text-center font-sans text-meta text-muted-foreground">Member since {created}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
