import type { EmailOtpType } from '@supabase/supabase-js';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

// Sign-up confirmation (Growth S3 follow-up, IN-GR-011). With "Confirm
// email" on, signUp returns no session and Supabase emails a link. The
// Confirm signup template links HTTPS to the Worker's /reset bridge with
// type=email, which forwards to videx://confirm-email?token_hash=…&type=email
// (query params survive the custom-scheme hop; see reset-password.tsx for
// why fragments do not). verifyOtp confirms the address and signs the
// person in; the screen then steps back to whatever it covered:
//  - onboarding's "Check your email" step, which carries on to Connect
//    Services (OnboardingFlow watches for the session),
//  - /auth, whose focus effect routes on,
//  - on a cold start, the tabs, whose guard sends a new account to onboarding.
// Route params are the source (they are correct on warm and cold starts).

const VERIFY_TIMEOUT_MS = 12_000;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default function ConfirmEmailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const tokenHash = first(params.token_hash) ?? '';
  const type: EmailOtpType = first(params.type) === 'signup' ? 'signup' : 'email';

  const [error, setError] = useState<string | null>(null);
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tokenHash) {
      setError('This confirmation link is incomplete. Sign in with your email and we can send a new one.');
      return;
    }
    if (attemptedRef.current === tokenHash) return;
    attemptedRef.current = tokenHash;
    setError(null);

    let active = true;
    const leave = () => {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    };
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      attemptedRef.current = null;
      setError("We couldn't confirm your email just now. Check your connection, then tap the link in the email again.");
    }, VERIFY_TIMEOUT_MS);

    (async () => {
      const { error: verifyError } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!active) return;
      clearTimeout(timer);
      if (!verifyError) {
        leave();
        return;
      }
      // The link may already have been used on this phone: a live session
      // means the account is confirmed, so carry on.
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        leave();
        return;
      }
      const transport = !verifyError.status && /network|fetch|connection|timed?[ -]?out|abort/i.test(verifyError.message);
      if (transport) attemptedRef.current = null;
      setError(
        transport
          ? "We couldn't reach Videx. Check your connection, then tap the link in the email again."
          : 'This link has expired or has already been used. Sign in with your email: if it still needs confirming, we can send a new link.',
      );
    })();

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenHash]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6 pt-12">
        <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">Confirm email</Text>
        {error ? (
          <>
            <Text className="mt-2 font-hero text-[36px] leading-[40px] text-foreground">That link didn&apos;t work.</Text>
            <Text className="mt-4 font-sans text-body text-muted-foreground">{error}</Text>
            <Pressable
              onPress={() => router.replace('/auth')}
              className="mt-8 h-14 flex-row items-center justify-center rounded-card bg-primary active:opacity-90">
              <Text className="font-sans-bold text-section text-white">Sign in</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text className="mt-2 font-hero text-[36px] leading-[40px] text-foreground">Confirming…</Text>
            <View className="mt-10 flex-row items-center gap-3">
              <ActivityIndicator color="#e85d25" />
              <Text className="font-sans text-body text-muted-foreground">Checking your link</Text>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
