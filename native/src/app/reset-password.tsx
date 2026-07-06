import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Eye, EyeOff, Lock } from 'lucide-react-native';
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

import { supabase } from '@/lib/supabase';

// In-app password reset (A5 / roadmap 0.8). The reset email's link
// deep-links here (videx://reset-password) carrying a recovery token.
// The native Supabase client runs detectSessionInUrl:false, so we parse
// the token out of the incoming URL ourselves and establish the recovery
// session, then let the user set a new password via updateUser().
//
// Requires `videx://reset-password` in the Supabase Redirect URLs
// allowlist (see providers/auth.tsx) — without it the email link never
// reaches this screen.

/** Pull auth params from a deep-link URL. Implicit-flow tokens arrive in
 *  the fragment (#access_token=…&refresh_token=…&type=recovery); a PKCE
 *  link would instead carry ?code=…. We check both. */
function parseAuthParams(url: string): {
  access_token?: string;
  refresh_token?: string;
  code?: string;
  type?: string;
} {
  const out: Record<string, string> = {};
  const grab = (qs: string) => {
    if (!qs) return;
    for (const pair of qs.split('&')) {
      const [k, v] = pair.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    }
  };
  const hashIdx = url.indexOf('#');
  const qIdx = url.indexOf('?');
  if (qIdx >= 0) grab(url.slice(qIdx + 1, hashIdx >= 0 ? hashIdx : undefined));
  if (hashIdx >= 0) grab(url.slice(hashIdx + 1));
  return out;
}

type Phase = 'verifying' | 'ready' | 'saving' | 'done' | 'error';

export default function ResetPasswordRoute() {
  const router = useRouter();
  const incomingUrl = Linking.useURL();

  const [phase, setPhase] = useState<Phase>('verifying');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);

  // Establish the recovery session from the deep-link token. Also listen
  // for PASSWORD_RECOVERY as a belt-and-braces path (fires if supabase-js
  // ever processes the URL itself).
  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && active) setPhase('ready');
    });

    (async () => {
      const url = incomingUrl ?? (await Linking.getInitialURL());
      if (!url) return; // wait for the URL (useURL updates when it arrives)
      const { access_token, refresh_token, code } = parseAuthParams(url);
      try {
        if (access_token && refresh_token) {
          const { error: e } = await supabase.auth.setSession({ access_token, refresh_token });
          if (!active) return;
          if (e) throw e;
          setPhase('ready');
        } else if (code) {
          const { error: e } = await supabase.auth.exchangeCodeForSession(code);
          if (!active) return;
          if (e) throw e;
          setPhase('ready');
        }
      } catch {
        if (!active) return;
        setError('This reset link has expired or already been used. Request a new one.');
        setPhase('error');
      }
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [incomingUrl]);

  const pwValid =
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[^a-zA-Z0-9]/.test(password);
  const confirmValid = confirm.length > 0 && confirm === password;
  const canSave = pwValid && confirmValid && phase === 'ready';

  const save = async () => {
    if (!canSave) return;
    setPhase('saving');
    setError(null);
    const { error: e } = await supabase.auth.updateUser({ password });
    if (e) {
      setError(e.message);
      setPhase('ready');
      return;
    }
    setPhase('done');
    // Recovery session is now a full session; bounce to the root and let
    // the (tabs) guard route tabs vs onboarding.
    router.replace('/');
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="grow px-6 pt-12" keyboardShouldPersistTaps="handled">
          <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
            Reset password
          </Text>
          <Text className="mt-2 font-hero text-[36px] leading-[40px] text-foreground">
            Set a new password.
          </Text>

          {phase === 'verifying' ? (
            <View className="mt-10 flex-row items-center gap-3">
              <ActivityIndicator color="#e85d25" />
              <Text className="font-sans text-body text-muted-foreground">
                Verifying your reset link…
              </Text>
            </View>
          ) : null}

          {phase === 'error' ? (
            <View className="mt-8">
              <Text className="font-sans text-body text-danger">{error}</Text>
              <Pressable onPress={() => router.replace('/auth')} className="mt-6">
                <Text className="font-sans-bold text-body text-primary">Back to sign in</Text>
              </Pressable>
            </View>
          ) : null}

          {phase === 'ready' || phase === 'saving' || phase === 'done' ? (
            <>
              <Text className="mt-3 font-sans text-body text-muted-foreground">
                At least 8 characters, with upper- and lower-case letters and a symbol.
              </Text>

              <View className="mt-6 gap-3">
                <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5">
                  <Lock size={18} color="rgba(245,241,232,0.62)" />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="New password"
                    placeholderTextColor="rgba(245,241,232,0.4)"
                    secureTextEntry={!show}
                    autoCapitalize="none"
                    className="flex-1 font-sans text-body text-foreground"
                  />
                  <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}>
                    {show ? (
                      <EyeOff size={18} color="rgba(245,241,232,0.62)" />
                    ) : (
                      <Eye size={18} color="rgba(245,241,232,0.62)" />
                    )}
                  </Pressable>
                </View>

                <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5">
                  <Lock size={18} color="rgba(245,241,232,0.62)" />
                  <TextInput
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder="Confirm new password"
                    placeholderTextColor="rgba(245,241,232,0.4)"
                    secureTextEntry={!show}
                    autoCapitalize="none"
                    className="flex-1 font-sans text-body text-foreground"
                  />
                </View>
              </View>

              {error ? <Text className="mt-3 font-sans text-meta text-danger">{error}</Text> : null}

              <Pressable
                onPress={save}
                disabled={!canSave}
                className={
                  canSave
                    ? 'mt-6 h-14 flex-row items-center justify-center rounded-card bg-primary active:opacity-90'
                    : 'mt-6 h-14 flex-row items-center justify-center rounded-card bg-secondary'
                }>
                {phase === 'saving' ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text
                    className={
                      canSave
                        ? 'font-sans-bold text-section text-white'
                        : 'font-sans-bold text-section text-muted-foreground'
                    }>
                    Update password
                  </Text>
                )}
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
