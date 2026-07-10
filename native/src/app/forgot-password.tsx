import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
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

// Dedicated Forgot-password screen (beta feedback 2026-07-09). Previously
// the reset flow was an inline "Forgot password?" tap on the sign-in
// screen with no confirmation state. This is a proper route:
//   email field → submit → "check your email" confirmation → resend
//   (with a cooldown so the user can't hammer the Supabase rate limit).
//
// It calls the same AuthProvider.forgotPassword() (which sends the reset
// email with redirectTo videx://reset-password); /reset-password handles
// the recovery session on the way back in.

const RESEND_COOLDOWN_SECONDS = 30;
// Trivial shape check — the real validation is Supabase's. We only want to
// stop obviously-empty submits so the button copy stays honest.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordRoute() {
  const router = useRouter();
  const { forgotPassword } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();

  // Prefilled from the sign-in screen's email field when present.
  const [email, setEmail] = useState(params.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const send = async () => {
    if (busy || cooldown > 0) return;
    const trimmed = email.trim();
    setError(null);
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const { error: e } = await forgotPassword(trimmed);
      if (e) {
        setError(e);
        return;
      }
      setSent(true);
      startCooldown();
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !busy && cooldown === 0 && email.trim().length > 0;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="grow px-6 pt-12" keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="mb-6 flex-row items-center gap-2 self-start">
            <ArrowLeft size={18} color="rgba(245,241,232,0.62)" />
            <Text className="font-sans-medium text-meta text-muted-foreground">Back</Text>
          </Pressable>

          <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
            Forgot password
          </Text>
          <Text className="mt-2 font-hero text-[36px] leading-[40px] text-foreground">
            {sent ? 'Check your email.' : 'Reset your password.'}
          </Text>

          {sent ? (
            <>
              <Text className="mt-3 font-sans text-body text-muted-foreground">
                If an account exists for{' '}
                <Text className="font-sans-bold text-foreground">{email.trim()}</Text>, we&apos;ve
                sent a link to reset your password. Open it on this device to continue.
              </Text>
              <Text className="mt-3 font-sans text-meta text-faint-foreground">
                No email after a minute? Check your spam folder, or resend below.
              </Text>

              <Pressable
                onPress={send}
                disabled={cooldown > 0 || busy}
                className={
                  cooldown > 0 || busy
                    ? 'mt-6 h-14 flex-row items-center justify-center rounded-card bg-secondary'
                    : 'mt-6 h-14 flex-row items-center justify-center rounded-card bg-primary active:opacity-90'
                }>
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text
                    className={
                      cooldown > 0
                        ? 'font-sans-bold text-section text-muted-foreground'
                        : 'font-sans-bold text-section text-white'
                    }>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
                  </Text>
                )}
              </Pressable>

              {error ? (
                <Text className="mt-3 font-sans text-meta text-danger">{error}</Text>
              ) : null}

              <Pressable onPress={() => router.replace('/auth')} className="mt-6 self-center">
                <Text className="font-sans-bold text-body text-primary">Back to sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="mt-3 font-sans text-body text-muted-foreground">
                Enter the email you signed up with and we&apos;ll send you a link to set a new
                password.
              </Text>

              <View className="mt-6 flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5">
                <Mail size={18} color="rgba(245,241,232,0.62)" />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor="rgba(245,241,232,0.4)"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  onSubmitEditing={send}
                  returnKeyType="send"
                  className="flex-1 font-sans text-body text-foreground"
                />
              </View>

              {error ? (
                <Text className="mt-3 font-sans text-meta text-danger">{error}</Text>
              ) : null}

              <Pressable
                onPress={send}
                disabled={!canSubmit}
                className={
                  canSubmit
                    ? 'mt-6 h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90'
                    : 'mt-6 h-14 flex-row items-center justify-center gap-2 rounded-card bg-secondary'
                }>
                {busy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text
                      className={
                        canSubmit
                          ? 'font-sans-bold text-section text-white'
                          : 'font-sans-bold text-section text-muted-foreground'
                      }>
                      Send reset link
                    </Text>
                    <ArrowRight size={20} color={canSubmit ? '#ffffff' : 'rgba(245,241,232,0.4)'} />
                  </>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
