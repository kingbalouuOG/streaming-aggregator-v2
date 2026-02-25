import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clearAllData } from '@/lib/storage/userPreferences';
import { setAuthState } from '@/lib/storage';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  username: string | null;
  isPasswordRecovery: boolean;
  signUp: (email: string, password: string, username: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ error?: string }>;
  deleteAccount: () => Promise<{ error?: string }>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
  resetPassword: (newPassword: string) => Promise<{ error?: string }>;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  username: null,
  isPasswordRecovery: false,
  signUp: async () => ({}),
  signIn: async () => ({}),
  signOut: async () => {},
  forgotPassword: async () => ({}),
  deleteAccount: async () => ({}),
  checkUsernameAvailable: async () => false,
  resetPassword: async () => ({}),
  clearPasswordRecovery: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthState(!!s, s?.user?.id ?? null);
      // Check if we arrived via a recovery link (hash may already be processed)
      if (window.location.hash.includes('type=recovery')) {
        setIsPasswordRecovery(true);
      }
      setLoading(false);
    }).catch((err) => {
      console.error('[Auth] Session check failed:', err);
      setSession(null);
      setAuthState(false, null);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, s) => {
        setSession(s);
        setAuthState(!!s, s?.user?.id ?? null);
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;
  const username = user?.user_metadata?.username ?? null;

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    if (error) return { error: error.message };
    return {};
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('[Auth] signOut error:', e);
    }
    // Don't clear localStorage — preserve preferences for same-user re-sign-in
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) return { error: error.message };
    return {};
  }, []);

  const resetPassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    setIsPasswordRecovery(false);
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    return {};
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    try {
      const { error } = await supabase.rpc('delete_own_account');
      if (error) return { error: error.message };
      await clearAllData(); // Explicitly clear on account deletion
      await signOut();
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Failed to delete account' };
    }
  }, [signOut]);

  const checkUsernameAvailable = useCallback(async (username: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (error) {
      console.error('[Auth] checkUsername error:', error);
      return false; // fail closed — assume taken when uncertain
    }
    return data === null;
  }, []);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    username,
    isPasswordRecovery,
    signUp,
    signIn,
    signOut,
    forgotPassword,
    deleteAccount,
    checkUsernameAvailable,
    resetPassword,
    clearPasswordRecovery,
  }), [user, session, loading, username, isPasswordRecovery, signUp, signIn, signOut, forgotPassword, deleteAccount, checkUsernameAvailable, resetPassword, clearPasswordRecovery]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
