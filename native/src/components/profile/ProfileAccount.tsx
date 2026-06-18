import { Check, Mail, User } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Account Details (NATIVE-4 W2; Track-2: editable). Username is
// editable (writes user_metadata.username via supabase.auth.updateUser,
// which flows back through onAuthStateChange). Email is read-only — changing
// it needs a verification flow (deferred).

export function ProfileAccount() {
  const { session } = useAuth();
  const user = session?.user;
  const email = user?.email ?? '';
  const initialName = ((user?.user_metadata?.username as string | undefined) ?? '') || email.split('@')[0] || 'You';
  const created = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null;

  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== initialName && name.trim().length >= 3;

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    const { error: e } = await supabase.auth.updateUser({ data: { username: name.trim() } });
    setBusy(false);
    if (e) setError(e.message);
    else setSaved(true);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Account Details" />
      <ScrollView contentContainerClassName="px-5 pb-4 pt-3" keyboardShouldPersistTaps="handled">
        <Text className="mb-1.5 font-sans text-kicker uppercase tracking-[1.6px] text-muted-foreground">Username</Text>
        <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5">
          <User size={18} color="rgba(245,241,232,0.62)" />
          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(t);
              setSaved(false);
            }}
            autoCapitalize="none"
            className="flex-1 font-sans-medium text-body text-foreground"
          />
        </View>

        <Text className="mb-1.5 mt-4 font-sans text-kicker uppercase tracking-[1.6px] text-muted-foreground">Email</Text>
        <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5">
          <Mail size={18} color="rgba(245,241,232,0.62)" />
          <Text className="flex-1 font-sans-medium text-body text-muted-foreground">{email}</Text>
        </View>

        <Pressable
          onPress={save}
          disabled={!dirty || busy}
          className={
            dirty && !busy
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
