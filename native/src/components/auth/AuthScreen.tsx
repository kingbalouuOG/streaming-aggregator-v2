import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, Eye, EyeOff, Lock, Mail, Popcorn } from 'lucide-react-native';
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

import { useAuth } from '@/providers/auth';
import { ProviderSignIn } from './ProviderSignIn';
import { ResendConfirmation } from './ResendConfirmation';

// Native sign-in screen ("Welcome back."). NATIVE-3 W1: sign-UP moved
// into onboarding Step 1, so this is sign-in only; "Create one" enters
// the onboarding flow. Growth S3 adds Apple/Google above the form; a new
// person who taps one here gets an account too, and the (tabs) guard
// sends them on to onboarding (which then starts at Connect Services).

export function AuthScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  // ?email= arrives from onboarding's "Check your email" ("Already confirmed? Sign in").
  const params = useLocalSearchParams<{ email?: string }>();
  const paramEmail = typeof params.email === 'string' ? params.email : '';
  const [email, setEmail] = useState(paramEmail);
  // Growth S3 follow-up (IN-GR-011): the address that still needs confirming.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (paramEmail) setEmail(paramEmail);
  }, [paramEmail]);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot-password now has its own route (email field, "check your
  // email" confirmation, resend-with-cooldown) instead of firing inline
  // here. Carry the typed email across so the user needn't retype it.
  const forgot = () => {
    router.push(
      email.trim()
        ? { pathname: '/forgot-password', params: { email: email.trim() } }
        : '/forgot-password',
    );
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setUnconfirmedEmail(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      const { error: e, errorCode } = await signIn(email.trim(), password);
      if (errorCode === 'email_not_confirmed') setUnconfirmedEmail(email.trim());
      else if (e) setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="grow px-6 pt-10" keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View className="items-center">
            <View
              className="h-20 w-20 items-center justify-center rounded-[20px] bg-primary"
              style={{
                shadowColor: '#e85d25',
                shadowOpacity: 0.5,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 0 },
              }}>
              <Popcorn size={40} color="#ffffff" strokeWidth={2} />
            </View>
            <Text className="mt-4 font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
              Sign in
            </Text>
            <Text className="mt-2 font-hero text-[40px] leading-[44px] text-foreground">
              Welcome back.
            </Text>
            <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
              Sign in to pick up where you left off.
            </Text>
          </View>

          {/* Growth S3: Apple (iOS) and Google above the email form. Success
              flips the session; auth.tsx's focus effect routes on from there
              and resumes a pending link, exactly as for an email sign-in. */}
          <View className="mt-8">
            <ProviderSignIn verb="signIn" disabled={busy} />
          </View>

          {/* Fields */}
          <View className="gap-3">
            <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5">
              <Mail size={18} color="rgba(245,241,232,0.62)" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor="rgba(245,241,232,0.4)"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                className="flex-1 font-sans text-body text-foreground"
              />
            </View>

            <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5">
              <Lock size={18} color="rgba(245,241,232,0.62)" />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="rgba(245,241,232,0.4)"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                className="flex-1 font-sans text-body text-foreground"
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                {showPassword ? (
                  <EyeOff size={18} color="rgba(245,241,232,0.62)" />
                ) : (
                  <Eye size={18} color="rgba(245,241,232,0.62)" />
                )}
              </Pressable>
            </View>
          </View>

          {/* Forgot password → dedicated route */}
          <Pressable onPress={forgot} className="mt-2 self-end" hitSlop={8}>
            <Text className="font-sans-medium text-meta text-muted-foreground">Forgot password?</Text>
          </Pressable>

          {error ? <Text className="mt-3 font-sans text-meta text-danger">{error}</Text> : null}

          {unconfirmedEmail ? (
            <View className="mt-4 rounded-card border border-border bg-card p-4">
              <Text className="font-sans-bold text-body text-foreground">Confirm your email first</Text>
              <Text className="mb-3 mt-1 font-sans text-meta text-muted-foreground">
                We sent a link to {unconfirmedEmail}. Open it on this phone, then sign in.
              </Text>
              <ResendConfirmation email={unconfirmedEmail} />
            </View>
          ) : null}

          {/* Submit */}
          <Pressable
            onPress={submit}
            disabled={busy}
            className="mt-6 h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90">
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text className="font-sans-bold text-section text-white">Sign In</Text>
                <ArrowRight size={20} color="#ffffff" />
              </>
            )}
          </Pressable>

          {/* Create account → onboarding */}
          <View className="mt-auto flex-row justify-center py-6">
            <Text className="font-sans text-body text-muted-foreground">
              Don&apos;t have an account?{' '}
            </Text>
            <Pressable onPress={() => router.push('/onboarding')}>
              <Text className="font-sans-bold text-body text-primary">Create one</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
