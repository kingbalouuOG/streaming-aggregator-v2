import { ArrowRight, Eye, EyeOff, Lock, Mail, Popcorn } from 'lucide-react-native';
import { useState } from 'react';
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

// Native auth screen (NATIVE-2 W6) — sign in / sign up toggle, matching
// the web "Welcome back." design. Password recovery deferred to NATIVE-3.

type Mode = 'signin' | 'signup';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  const submit = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      if (isSignup) {
        const { error: e, needsConfirmation } = await signUp(email.trim(), password);
        if (e) setError(e);
        else if (needsConfirmation)
          setNotice('Check your email to confirm your account, then sign in.');
      } else {
        const { error: e } = await signIn(email.trim(), password);
        if (e) setError(e);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerClassName="grow px-6 pt-10"
          keyboardShouldPersistTaps="handled">
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
              {isSignup ? 'Create account' : 'Sign in'}
            </Text>
            <Text className="mt-2 font-display-black text-[40px] leading-[44px] text-foreground">
              {isSignup ? 'Get started.' : 'Welcome back.'}
            </Text>
            <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
              {isSignup
                ? 'Create an account to build your watchlist and tune your taste.'
                : 'Sign in to pick up where you left off.'}
            </Text>
          </View>

          {/* Fields */}
          <View className="mt-8 gap-3">
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

          {error ? (
            <Text className="mt-3 font-sans text-meta text-danger">{error}</Text>
          ) : null}
          {notice ? (
            <Text className="mt-3 font-sans text-meta text-primary-on-soft">{notice}</Text>
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
                <Text className="font-sans-bold text-section text-white">
                  {isSignup ? 'Create account' : 'Sign In'}
                </Text>
                <ArrowRight size={20} color="#ffffff" />
              </>
            )}
          </Pressable>

          {/* Mode toggle */}
          <View className="mt-auto flex-row justify-center py-6">
            <Text className="font-sans text-body text-muted-foreground">
              {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <Pressable
              onPress={() => {
                setMode(isSignup ? 'signin' : 'signup');
                setError(null);
                setNotice(null);
              }}>
              <Text className="font-sans-bold text-body text-primary">
                {isSignup ? 'Sign in' : 'Create one'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
