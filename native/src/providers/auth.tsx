import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setAuthState } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
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
// forgotPassword sends the reset email; the in-app deep-link reset screen
// + account deletion remain deferred.

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
        await supabase.auth.signOut();
        // Wipe the persisted query cache so the next user on this device
        // never sees the previous user's cached feeds.
        clearQueryCache();
      },
      async forgotPassword(email) {
        // Sends the reset email (Supabase Site URL handles the link). The
        // in-app deep-link reset screen is still deferred.
        const { error } = await supabase.auth.resetPasswordForEmail(email);
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
        // Deletion also ends the session; mirror signOut's cache wipe.
        await supabase.auth.signOut();
        clearQueryCache();
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
