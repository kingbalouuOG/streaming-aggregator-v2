import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setAuthState } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

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
// Deferred to NATIVE-3: password recovery (needs a deep-link flow),
// username availability checks, account deletion.

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
