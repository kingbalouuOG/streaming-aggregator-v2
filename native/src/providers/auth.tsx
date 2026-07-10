import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import storage, { setAuthState } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { clearPushToken } from '@/notifications/push';
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
// Account deletion remains deferred.
//
// ⚠ Supabase dashboard requirement: `videx://reset-password` (or
// `videx://*`) MUST be in Authentication → URL Configuration → Redirect
// URLs, or Supabase ignores redirectTo and the link dead-ends at the Site
// URL. See native/README + the wiki password-reset runbook.

interface AuthState {
  session: Session | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    username?: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ error: string | null }>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
  deleteAccount: () => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthState | null>(null);

function syncStorageAuth(session: Session | null) {
  setAuthState(!!session, session?.user?.id ?? null);
}

// Wipe per-user local state when a session ends (sign-out or account
// deletion) so the next user on this device starts clean: the persisted
// query cache (cached feeds) AND the one-time feedback-prompt bookkeeping
// (device-global MMKV keys mirrored from useFeedbackPrompt.ts — kept in
// sync there). Without the latter, user B inherits A's "already shown"
// flag or banked foreground time.
async function clearLocalUserState(): Promise<void> {
  clearQueryCache();
  await storage.multiRemove(['fb_prompt_shown', 'fb_fg_ms']);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

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

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      initializing,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
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
      async signOut() {
        // Delete this device's push-token row BEFORE ending the session:
        // the DELETE is RLS-gated (owner-only), so once signOut() destroys
        // the JWT the request silently matches nothing and the row orphans —
        // the device keeps receiving the signed-out user's alerts. (Found in
        // the 2026-07-10 device-test walk-through; the NotificationsProvider
        // effect fires on session-null, which is inherently too late — it
        // remains as local-state cleanup and no-ops the DB call.)
        await clearPushToken();
        await supabase.auth.signOut();
        await clearLocalUserState();
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
        const { error } = await supabase.rpc('delete_own_account');
        if (error) return { error: error.message };
        // Deletion also ends the session; mirror signOut's local wipe.
        await supabase.auth.signOut();
        await clearLocalUserState();
        return { error: null };
      },
    }),
    [session, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
