import { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { createAppleNonce } from '@/lib/auth/appleNonce';
import storage, { setAuthState } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { clearPushToken } from '@/notifications/push';
import { clearOnboardingDraft } from '@/onboardingDraft';
import { clearPendingLink } from '@/pendingLink';
import { clearQueryCache } from '@/queryPersist';

// Native auth provider (NATIVE-2 W6). Wraps the supabase-js auth surface
// and keeps the storage layer's auth-state routing (setAuthState) in
// sync so watchlist/preferences flip to the Supabase backend when signed
// in. Session persistence is handled by the native supabase client
// (MMKV storage adapter); this just mirrors it into React state and the
// storage singleton.
//
// MUST live in native/src (NOT native/src/lib — that path is the junction
// to the shared engine tree, where 'react' resolves to the ROOT copy and
// hooks crash with "Cannot read property 'useState' of null"). Pure
// shared-lib modules (storage, supabase) are fine to import from there;
// React-hook components are not.
//
// forgotPassword sends the reset email with a redirectTo deep link back
// into the app (videx://reset-password); the /reset-password route
// handles the recovery session and password update (A5 / roadmap 0.8).
//
// ⚠ Supabase dashboard requirement: `videx://reset-password` (or
// `videx://*`) MUST be in Authentication → URL Configuration → Redirect
// URLs, or Supabase ignores redirectTo and the link dead-ends at the Site
// URL. See native/README + the wiki password-reset runbook.
//
// Growth S3: Apple (iOS only) and Google sign-in through the native SDKs +
// supabase.auth.signInWithIdToken. A new identity with no username gets the
// migration-089 placeholder and a "Choose your name" prompt; a matching
// verified email auto-links to the existing account (Supabase default).
// Both providers must be enabled in the Supabase dashboard (release
// runbook → Sign-in providers). Neither touches the pending link: auth.tsx
// and curating.tsx resume it exactly as after an email sign-in / sign-up.

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

// Without the web client id there is no id token; without the iOS id the
// build has no URL scheme (app.config.js) and GoogleSignin crashes on iOS.
const GOOGLE_AVAILABLE =
  Platform.OS !== 'web' && !!GOOGLE_WEB_CLIENT_ID && (Platform.OS !== 'ios' || !!GOOGLE_IOS_CLIENT_ID);

/** Same shape as signIn plus the signed-in user id. A cancelled sheet is
 *  `{ error: null, userId: null }`: callers show nothing. */
export interface ProviderSignInResult {
  error: string | null;
  userId: string | null;
}

interface AuthState {
  session: Session | null;
  initializing: boolean;
  /** errorCode is Supabase's code, e.g. 'email_not_confirmed'. */
  signIn: (email: string, password: string) => Promise<{ error: string | null; errorCode: string | null }>;
  signUp: (
    email: string,
    password: string,
    username?: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  /** Re-send the sign-up confirmation email (Confirm email on). */
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<ProviderSignInResult>;
  signInWithGoogle: () => Promise<ProviderSignInResult>;
  /** iOS with Sign in with Apple available on the device. */
  isAppleAvailable: boolean;
  /** Google client ids are configured for this build. */
  isGoogleAvailable: boolean;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ error: string | null }>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
  /** cancelled: the person closed Apple's confirmation sheet; nothing was deleted. */
  deleteAccount: () => Promise<{ error: string | null; cancelled?: boolean }>;
}

const AuthContext = createContext<AuthState | null>(null);

const CANCELLED: ProviderSignInResult = { error: null, userId: null };

// The given name a provider returned on this sign-in, kept in memory only
// (never stored) to prefill "Choose your name". Apple sends it on the very
// first authorisation and never again, so it is captured here.
let providerGivenName: string | null = null;

export function peekProviderGivenName(): string | null {
  return providerGivenName;
}

export function clearProviderGivenName(): void {
  providerGivenName = null;
}

let googleConfigured = false;

function configureGoogle() {
  if (googleConfigured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });
  googleConfigured = true;
}

/** Whether the account has a Sign in with Apple identity (its own, or linked
 *  to an email account by matching address). */
export function hasAppleIdentity(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.identities?.some((i) => i.provider === 'apple')) return true;
  const providers = user.app_metadata?.providers as string[] | undefined;
  return Array.isArray(providers) && providers.includes('apple');
}

const APPLE_REVOKE_FAILED =
  "We couldn't disconnect Sign in with Apple, so your account has not been deleted. Try again, or email privacy@videxstreaming.com.";

function providerFailure(provider: 'Apple' | 'Google'): ProviderSignInResult {
  return { error: `Couldn't sign in with ${provider}. Try again, or use your email.`, userId: null };
}

async function finishWithIdToken(
  provider: 'apple' | 'google',
  token: string,
  nonce?: string,
): Promise<ProviderSignInResult> {
  const { data, error } = await supabase.auth.signInWithIdToken({ provider, token, nonce });
  if (error) {
    providerGivenName = null;
    console.error(`[Auth] signInWithIdToken(${provider}) error:`, error);
    return { error: error.message, userId: null };
  }
  return { error: null, userId: data.user?.id ?? null };
}

function syncStorageAuth(session: Session | null) {
  setAuthState(!!session, session?.user?.id ?? null);
}

// Wipe per-user local state when a session ends (sign-out or account
// deletion) so the next user on this device starts clean:
//  - the LIVE QueryClient — most query keys are not user-scoped
//    (['native','watchlist'], feeds, services), so without this user B
//    sees user A's data from memory; worse, the persister re-dehydrates
//    the live cache moments after the disk wipe, undoing it (pre-launch
//    review 2026-07-12).
//  - the persisted query cache on disk (cached feeds).
//  - the onboarding draft — device-global MMKV with no user identity;
//    left behind, user B resumes user A's half-finished onboarding and
//    can seed their taste profile from A's picks (same review).
//  - the one-time feedback-prompt bookkeeping (device-global MMKV keys
//    mirrored from useFeedbackPrompt.ts — kept in sync there).
//  - Growth S3: the in-memory provider name, and Google's cached account,
//    so the next person gets Google's account chooser, not A's account.
async function clearLocalUserState(queryClient: QueryClient): Promise<void> {
  queryClient.clear();
  clearQueryCache();
  clearOnboardingDraft();
  // A link opened by user A must not resume into user B's session.
  clearPendingLink();
  providerGivenName = null;
  if (googleConfigured) await GoogleSignin.signOut().catch(() => {});
  await storage.multiRemove(['fb_prompt_shown', 'fb_fg_ms']);
}

/** clearPushToken performs a network DELETE with no timeout of its own;
 *  never let a hung connection block sign-out (errors are already
 *  swallowed inside, so racing it is safe — worst case the row is
 *  reclaimed by the 060 RPC on next sign-in). */
function clearPushTokenBounded(ms = 3000): Promise<unknown> {
  return Promise.race([clearPushToken(), new Promise((r) => setTimeout(r, ms))]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      syncStorageAuth(data.session);
      setSession(data.session);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      syncStorageAuth(nextSession);
      setSession(nextSession);
    });

    // Apple on iOS only (Joe, 14 Sept): Android shows Google alone.
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync()
        .then((available) => mounted && setIsAppleAvailable(available))
        .catch(() => {});
    }

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      initializing,
      isAppleAvailable,
      isGoogleAvailable: GOOGLE_AVAILABLE,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null, errorCode: error?.code ?? null };
      },
      async signUp(email, password, username) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: username ? { data: { username } } : undefined,
        });
        return {
          error: error?.message ?? null,
          // No session back on signUp ⇒ email confirmation is on.
          needsConfirmation: !error && !data.session,
        };
      },
      async resendConfirmation(email) {
        const { error } = await supabase.auth.resend({ type: 'signup', email });
        return { error: error?.message ?? null };
      },
      async signInWithApple() {
        try {
          // Apple gets SHA-256(raw); Supabase gets raw and re-hashes it.
          const nonce = await createAppleNonce({
            randomBytes: Crypto.getRandomBytes,
            sha256Hex: (v) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, v),
          });
          const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
            nonce: nonce.hashed,
          });
          if (!credential.identityToken) return providerFailure('Apple');
          // Set before the session flips: routing can run as soon as it does.
          providerGivenName = credential.fullName?.givenName ?? null;
          return await finishWithIdToken('apple', credential.identityToken, nonce.raw);
        } catch (e) {
          if ((e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return CANCELLED;
          console.error('[Auth] Apple sign-in failed:', e);
          return providerFailure('Apple');
        }
      },
      async signInWithGoogle() {
        if (!GOOGLE_AVAILABLE) return providerFailure('Google');
        try {
          configureGoogle();
          await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
          const response = await GoogleSignin.signIn();
          if (isCancelledResponse(response)) return CANCELLED;
          const { idToken, user } = response.data;
          if (!idToken) return providerFailure('Google');
          providerGivenName = user.givenName;
          return await finishWithIdToken('google', idToken);
        } catch (e) {
          if (isErrorWithCode(e)) {
            if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return CANCELLED;
            if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
              return { error: 'Google sign-in needs Google Play services. Update them, or use your email.', userId: null };
            }
          }
          console.error('[Auth] Google sign-in failed:', e);
          return providerFailure('Google');
        }
      },
      async signOut() {
        // Delete this device's push-token row BEFORE ending the session:
        // the DELETE is RLS-gated (owner-only), so once signOut() destroys
        // the JWT the request silently matches nothing and the row orphans —
        // the device keeps receiving the signed-out user's alerts. (Found in
        // the 2026-07-10 device-test walk-through; the NotificationsProvider
        // effect fires on session-null, which is inherently too late — it
        // remains as local-state cleanup and no-ops the DB call.)
        await clearPushTokenBounded();
        await supabase.auth.signOut();
        await clearLocalUserState(queryClient);
      },
      async forgotPassword(email) {
        // Deep-link the reset link back into the app so the recovery
        // session lands on /reset-password (handled there). createURL
        // yields videx://reset-password in a standalone build.
        const redirectTo = Linking.createURL('reset-password');
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        return { error: error?.message ?? null };
      },
      async checkUsernameAvailable(username) {
        const { data, error } = await supabase.rpc('username_available', {
          check_username: username,
        });
        if (error) {
          console.error('[Auth] checkUsername error:', error);
          return false;
        }
        return data === true;
      },
      async deleteAccount() {
        // IN-GR-010 (App Store 5.1.1(v)): an Apple-linked account revokes its
        // Apple tokens first. Videx stores none, so re-authorise with Apple for
        // a fresh authorization code and let revoke-apple-token exchange and
        // revoke it. Nothing is deleted unless that succeeds. Apple sign-in
        // exists only on iOS; on Android the revoke is skipped (IN-GR-020).
        if (hasAppleIdentity(session?.user) && isAppleAvailable) {
          let authorizationCode: string | null = null;
          try {
            const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
            authorizationCode = credential.authorizationCode;
          } catch (e) {
            if ((e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return { error: null, cancelled: true };
            console.error('[Auth] Apple re-authorisation for deletion failed:', e);
            return { error: APPLE_REVOKE_FAILED };
          }
          if (!authorizationCode) return { error: APPLE_REVOKE_FAILED };
          const { error: revokeError } = await supabase.functions.invoke('revoke-apple-token', {
            body: { authorizationCode },
          });
          if (revokeError) {
            console.error('[Auth] revoke-apple-token failed:', revokeError);
            return { error: APPLE_REVOKE_FAILED };
          }
        }
        const { error } = await supabase.rpc('delete_own_account');
        if (error) return { error: error.message };
        // Deletion also ends the session; mirror signOut's local wipe.
        await supabase.auth.signOut();
        await clearLocalUserState(queryClient);
        return { error: null };
      },
    }),
    [session, initializing, isAppleAvailable, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
