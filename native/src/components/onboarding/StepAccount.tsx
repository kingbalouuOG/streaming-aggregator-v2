import { ArrowRight, Check, Eye, EyeOff, Lock, Mail, Popcorn, Shuffle, User, Users } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
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

import { useAuth } from '@/providers/auth';

// Onboarding Step 1 — "Join VIDEX" (matches V2 Onboarding/Step 1.png).
// Account creation: validated email/username/password/confirm, optional
// age-range + viewing-context chips, ToS line, own Continue CTA → signUp.
// Username server-availability check is deferred (NATIVE-3): a green tick
// shows on valid FORMAT only.

const AGE_RANGES = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+'];
const VIEWING = [
  { id: 'solo', label: 'Solo', Icon: User },
  { id: 'partner', label: 'With a partner', Icon: Users },
  { id: 'family', label: 'With family', Icon: Users },
  { id: 'mix', label: 'Mix', Icon: Shuffle },
] as const;

const MUTED = 'rgba(245,241,232,0.62)';

export function StepAccount({
  onAccountCreated,
}: {
  onAccountCreated: (ageRange: string | null, viewingContext: string | null) => void;
}) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const usernameValid =
    username.length >= 3 && /^[a-z0-9]([a-z0-9_.]*[a-z0-9])?$/.test(username) && !/[_.]{2}/.test(username);
  const pwValid = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[^a-zA-Z0-9]/.test(password);
  const confirmValid = confirm.length > 0 && confirm === password;
  const canSubmit = emailValid && usernameValid && pwValid && confirmValid;

  const onUsername = (raw: string) => setUsername(raw.toLowerCase().replace(/\s/g, '').slice(0, 20));

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await signUp(email.trim(), password, username);
    setBusy(false);
    if (e) setError(e);
    else onAccountCreated(ageRange, viewing);
  };

  const fieldBorder = (touched: boolean, valid: boolean) =>
    !touched ? 'border-border' : valid ? 'border-success/50' : 'border-danger/60';

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerClassName="px-6 pt-4 pb-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View className="items-center pb-5">
          <View
            className="h-16 w-16 items-center justify-center rounded-[20px] bg-primary"
            style={{ shadowColor: '#e85d25', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } }}>
            <Popcorn size={30} color="#ffffff" strokeWidth={2} />
          </View>
          <Text className="mt-3 font-display-bold text-headline text-foreground">Join VIDEX</Text>
          <Text className="mt-1 text-center font-sans text-body text-muted-foreground">
            Start discovering what to watch tonight
          </Text>
        </View>

        {/* Fields */}
        <View className="gap-2.5">
          <Field icon={<Mail size={18} color={MUTED} />} border={fieldBorder(email.length > 0, emailValid)}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="rgba(245,241,232,0.4)"
              autoCapitalize="none"
              keyboardType="email-address"
              className="flex-1 font-sans text-body text-foreground"
            />
          </Field>

          <Field icon={<User size={18} color={MUTED} />} border={fieldBorder(username.length > 0, usernameValid)}>
            <TextInput
              value={username}
              onChangeText={onUsername}
              placeholder="Username"
              placeholderTextColor="rgba(245,241,232,0.4)"
              autoCapitalize="none"
              className="flex-1 font-sans text-body text-foreground"
            />
            {usernameValid ? <Check size={18} color="#10b981" /> : null}
          </Field>

          <Field icon={<Lock size={18} color={MUTED} />} border={fieldBorder(password.length > 0, pwValid)}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="rgba(245,241,232,0.4)"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              className="flex-1 font-sans text-body text-foreground"
            />
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8}>
              {showPw ? <EyeOff size={18} color={MUTED} /> : <Eye size={18} color={MUTED} />}
            </Pressable>
          </Field>

          <Field icon={<Lock size={18} color={MUTED} />} border={fieldBorder(confirm.length > 0, confirmValid)}>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm password"
              placeholderTextColor="rgba(245,241,232,0.4)"
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              className="flex-1 font-sans text-body text-foreground"
            />
            <Pressable onPress={() => setShowConfirm((v) => !v)} hitSlop={8}>
              {showConfirm ? <EyeOff size={18} color={MUTED} /> : <Eye size={18} color={MUTED} />}
            </Pressable>
          </Field>
        </View>

        {/* Optional: about you */}
        <Text className="mt-6 font-sans-bold text-body text-foreground">A little about you</Text>
        <Text className="mt-1 font-sans text-meta text-muted-foreground">
          Optional — helps us recommend the right content from day one.
        </Text>

        <Text className="mt-4 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
          Age range
        </Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {AGE_RANGES.map((a) => (
            <Chip key={a} label={a} active={ageRange === a} onPress={() => setAgeRange((v) => (v === a ? null : a))} />
          ))}
        </View>

        <Text className="mt-4 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
          How do you usually watch?
        </Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {VIEWING.map(({ id, label, Icon }) => {
            const active = viewing === id;
            return (
              <Pressable
                key={id}
                onPress={() => setViewing((v) => (v === id ? null : id))}
                className={
                  active
                    ? 'flex-row items-center gap-2 rounded-card border border-primary bg-primary-soft px-3.5 py-2.5'
                    : 'flex-row items-center gap-2 rounded-card border border-border bg-card px-3.5 py-2.5 active:bg-secondary'
                }>
                <Icon size={15} color={active ? '#ff8d5a' : MUTED} />
                <Text className={active ? 'font-sans-medium text-body text-primary-on-soft' : 'font-sans-medium text-body text-muted-foreground'}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ToS */}
        <Text className="mt-6 text-center font-sans text-meta text-muted-foreground">
          By creating an account, you agree to our{' '}
          <Text className="text-primary">Terms of Service</Text> and{' '}
          <Text className="text-primary">Privacy Policy</Text>
        </Text>

        {error ? <Text className="mt-3 text-center font-sans text-meta text-danger">{error}</Text> : null}

        {/* CTA */}
        <Pressable
          onPress={submit}
          disabled={!canSubmit || busy}
          className={
            canSubmit && !busy
              ? 'mt-5 h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90'
              : 'mt-5 h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary/40'
          }>
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Text className="font-sans-bold text-section text-white">Continue</Text>
              <ArrowRight size={20} color="#ffffff" />
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  icon,
  border,
  children,
}: {
  icon: ReactNode;
  border: string;
  children: ReactNode;
}) {
  return (
    <View className={`flex-row items-center gap-3 rounded-card border ${border} bg-card px-4 py-3.5`}>
      {icon}
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={
        active
          ? 'rounded-card border border-primary bg-primary-soft px-3.5 py-2'
          : 'rounded-card border border-border bg-card px-3.5 py-2 active:bg-secondary'
      }>
      <Text className={active ? 'font-sans-medium text-body text-primary-on-soft' : 'font-sans-medium text-body text-muted-foreground'}>
        {label}
      </Text>
    </Pressable>
  );
}
