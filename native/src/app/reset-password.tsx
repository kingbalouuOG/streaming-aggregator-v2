import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import type { EmailOtpType } from '@supabase/supabase-js';
import { Eye, EyeOff, Lock } from 'lucide-react-native';
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

import { supabase } from '@/lib/supabase';

// In-app password reset (A5 / roadmap 0.8). The reset email's link
// deep-links here (videx://reset-password) carrying a recovery token.
// The native Supabase client runs detectSessionInUrl:false, so we parse
// the token out of the incoming URL ourselves and establish the recovery
// session, then let the user set a new password via updateUser().
//
// ── Root cause of the "Verifying your reset link…" hang (beta feedback
// 2026-07-09) ───────────────────────────────────────────────────────
// Supabase's reset email link goes to /auth/v1/verify which, on the
// IMPLICIT flow (our client is not PKCE), 302-redirects to
// `videx://reset-password#access_token=…&refresh_token=…&type=recovery`
// — the tokens live in the URL *fragment*. The HTTP→custom-scheme hop
// frequently DROPS the fragment: the OS hands Expo just
// `videx://reset-password` with no params. The old screen parsed the
// URL, found neither access_token nor code, fell through BOTH branches
// without ever calling setPhase, and sat on 'verifying' forever — with
// no timeout and no else-branch. Same link retried ⇒ same hang.
//
// The robust fix is the token_hash path: a customised Recovery email
// template links to `videx://reset-password?token_hash={{ .TokenHash }}
// &type=recovery` (query params survive the hop), and we call
// verifyOtp({ type:'recovery', token_hash }). We still accept the
// implicit fragment tokens and PKCE ?code as fallbacks, surface an
// explicit expired/used error, AND time out to an error state so the
// spinner can never spin forever. See the auth-email-smtp wiki runbook
// for the template change.
//
// Requires `videx://reset-password` in the Supabase Redirect URLs
// allowlist (see providers/auth.tsx) — without it the email link never
// reaches this screen.

interface AuthParams {
  access_token?: string;
  refresh_token?: string;
  code?: string;
  token_hash?: string;
  type?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
}

/** Pull auth params from a deep-link URL. Recovery links can arrive as:
 *   - ?token_hash=…&type=recovery   (customised template — preferred)
 *   - #access_token=…&refresh_token=…&type=recovery  (implicit default)
 *   - ?code=…                        (PKCE)
 *   - ?error=…&error_description=…   (expired/used link)
 *  We scan BOTH the query string and the fragment. */
function parseAuthParams(url: string): AuthParams {
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
  if (qIdx >= 0) grab(url.slice(qIdx + 1, hashIdx >= 0 && hashIdx > qIdx ? hashIdx : undefined));
  if (hashIdx >= 0) grab(url.slice(hashIdx + 1));
  return out;
}

type Phase = 'verifying' | 'ready' | 'saving' | 'done' | 'error';
/** Distinguish an expired/used link (offer "request a new one") from a
 *  generic verify timeout/failure (offer a retry via a fresh email). */
type ErrorKind = 'expired' | 'timeout' | 'generic';

// If no usable token has resolved into a session within this window we
// stop "verifying" and show an actionable error rather than spinning.
const VERIFY_TIMEOUT_MS = 12_000;

export default function ResetPasswordRoute() {
  const router = useRouter();
  const incomingUrl = Linking.useURL();

  const [phase, setPhase] = useState<Phase>('verifying');
  const [errorKind, setErrorKind] = useState<ErrorKind>('generic');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);

  // Guard against double-establishment: once any path flips us to 'ready'
  // (or a terminal error), later async resolutions must not clobber it.
  const settledRef = useRef(false);
  const settle = (fn: () => void) => {
    if (settledRef.current) return;
    settledRef.current = true;
    fn();
  };

  const fail = (kind: ErrorKind, message: string) =>
    settle(() => {
      setErrorKind(kind);
      setError(message);
      setPhase('error');
    });

  // Establish the recovery session from the deep-link token. Also listen
  // for PASSWORD_RECOVERY as a belt-and-braces path (fires if supabase-js
  // ever processes the URL itself).
  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && active) settle(() => setPhase('ready'));
    });

    // Timeout fallback: if nothing has established a recovery session by
    // now, the fragment was almost certainly dropped on the redirect hop
    // (see root-cause note above). Never leave the spinner running.
    const timer = setTimeout(() => {
      if (!active) return;
      fail(
        'timeout',
        "We couldn't verify your reset link. It may have expired — request a new one below.",
      );
    }, VERIFY_TIMEOUT_MS);

    (async () => {
      const url = incomingUrl ?? (await Linking.getInitialURL());
      if (!url) return; // wait for the URL (useURL updates when it arrives)
      const p = parseAuthParams(url);

      // An explicit Supabase error rides back as ?error=…&error_code=… —
      // treat access_denied / otp_expired as an expired/used link.
      if (p.error || p.error_code) {
        const expired =
          /expired|invalid|access_denied/i.test(`${p.error_code} ${p.error} ${p.error_description}`);
        fail(
          expired ? 'expired' : 'generic',
          expired
            ? 'This reset link has expired or already been used. Request a new one below.'
            : p.error_description || 'This reset link could not be used. Request a new one below.',
        );
        return;
      }

      try {
        if (p.token_hash) {
          // Preferred path — query param survives the custom-scheme hop.
          const { error: e } = await supabase.auth.verifyOtp({
            type: (p.type as EmailOtpType) || 'recovery',
            token_hash: p.token_hash,
          });
          if (!active) return;
          if (e) throw e;
          settle(() => setPhase('ready'));
        } else if (p.access_token && p.refresh_token) {
          const { error: e } = await supabase.auth.setSession({
            access_token: p.access_token,
            refresh_token: p.refresh_token,
          });
          if (!active) return;
          if (e) throw e;
          settle(() => setPhase('ready'));
        } else if (p.code) {
          const { error: e } = await supabase.auth.exchangeCodeForSession(p.code);
          if (!active) return;
          if (e) throw e;
          settle(() => setPhase('ready'));
        }
        // No recognised params yet: do nothing and let the timeout OR a
        // late PASSWORD_RECOVERY event settle us. (A bare
        // videx://reset-password with a dropped fragment lands here.)
      } catch {
        if (!active) return;
        fail(
          'expired',
          'This reset link has expired or already been used. Request a new one below.',
        );
      }
    })();

    return () => {
      active = false;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              {/* Expired/used or timed-out links can't be salvaged — the
                  only real recovery is a fresh email, so route back to
                  the dedicated Forgot-password screen. */}
              {errorKind === 'expired' || errorKind === 'timeout' ? (
                <Pressable
                  onPress={() => router.replace('/forgot-password')}
                  className="mt-6 h-14 flex-row items-center justify-center rounded-card bg-primary active:opacity-90">
                  <Text className="font-sans-bold text-section text-white">
                    Request a new link
                  </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => router.replace('/auth')} className="mt-4 self-center">
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
