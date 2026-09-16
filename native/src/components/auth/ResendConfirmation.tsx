import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/providers/auth';

// "Resend link" for the sign-up confirmation email (Growth S3 follow-up,
// IN-GR-011), shared by onboarding's "Check your email" step and the sign-in
// screen's "confirm your email first" notice. Supabase refuses a resend within
// 60s of the last email, so the button waits that long after each send.

const COOLDOWN_SECONDS = 60;

export function ResendConfirmation({ email }: { email: string }) {
  const { resendConfirmation } = useAuth();
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (sending || cooldown > 0) return;
    setSending(true);
    setError(null);
    setSent(false);
    const { error: e } = await resendConfirmation(email);
    setSending(false);
    if (e) {
      setError(e);
      return;
    }
    setSent(true);
    setCooldown(COOLDOWN_SECONDS);
  };

  const waiting = sending || cooldown > 0;

  return (
    <View>
      <Pressable
        onPress={resend}
        disabled={waiting}
        accessibilityRole="button"
        className={
          waiting
            ? 'h-12 flex-row items-center justify-center rounded-card border border-border'
            : 'h-12 flex-row items-center justify-center rounded-card border border-border active:bg-secondary'
        }>
        {sending ? (
          <ActivityIndicator color="rgba(245,241,232,0.62)" />
        ) : (
          <Text className={waiting ? 'font-sans-bold text-body text-muted-foreground' : 'font-sans-bold text-body text-foreground'}>
            {cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend link'}
          </Text>
        )}
      </Pressable>
      {sent ? <Text className="mt-2 text-center font-sans text-meta text-success">Sent. Check your inbox.</Text> : null}
      {error ? <Text className="mt-2 text-center font-sans text-meta text-danger">{error}</Text> : null}
    </View>
  );
}
