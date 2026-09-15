import * as AppleAuthentication from 'expo-apple-authentication';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAuth, type ProviderSignInResult } from '@/providers/auth';

// Apple and Google sign-in (Growth S3), shared by the sign-in screen and
// onboarding Step 1: the buttons, their own error line, an optional slot
// (Step 1's terms line) and the "or" divider above the email form. Renders
// nothing when neither provider is available, so the email form reads
// exactly as before.
//
// Apple: the system AppleAuthenticationButton, iOS only. WHITE style: Apple's
// HIG rules out the black button on dark backgrounds, and Videx is dark.
// Google: a custom button inside Google's branding rules (the standard
// four-colour "G", light theme: #FFFFFF fill, 1px #747775 stroke, #1F1F1F
// label, "Sign in with / Continue with Google"), at the app's 56pt CTA size
// and card radius so the two read as a pair.

const BUTTON_HEIGHT = 56; // h-14
const CARD_RADIUS = 12; // tailwind `rounded-card`

type Provider = 'apple' | 'google';

export function ProviderSignIn({
  verb,
  disabled = false,
  onSignedIn,
  children,
}: {
  verb: 'signIn' | 'continue';
  /** The email form is submitting. */
  disabled?: boolean;
  /** Fired after a successful sign-in (not on cancel). The session has
   *  already flipped by then. */
  onSignedIn?: (userId: string) => void;
  children?: ReactNode;
}) {
  const { isAppleAvailable, isGoogleAvailable, signInWithApple, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isAppleAvailable && !isGoogleAvailable) return null;

  const inactive = disabled || busy !== null;
  const googleLabel = verb === 'signIn' ? 'Sign in with Google' : 'Continue with Google';

  const run = async (provider: Provider, signInWith: () => Promise<ProviderSignInResult>) => {
    if (inactive) return;
    setError(null);
    setBusy(provider);
    try {
      const result = await signInWith();
      if (result.error) setError(result.error);
      else if (result.userId) onSignedIn?.(result.userId);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View>
      <View className="gap-3">
        {isAppleAvailable ? (
          <View pointerEvents={inactive ? 'none' : 'auto'} style={{ opacity: inactive ? 0.5 : 1 }}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                verb === 'signIn'
                  ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={CARD_RADIUS}
              style={{ height: BUTTON_HEIGHT, width: '100%' }}
              onPress={() => void run('apple', signInWithApple)}
            />
          </View>
        ) : null}

        {isGoogleAvailable ? (
          <Pressable
            onPress={() => void run('google', signInWithGoogle)}
            disabled={inactive}
            accessibilityRole="button"
            accessibilityLabel={googleLabel}
            style={{ opacity: inactive && busy !== 'google' ? 0.5 : 1 }}
            className="h-14 flex-row items-center justify-center gap-3 rounded-card border border-[#747775] bg-white active:opacity-90">
            {busy === 'google' ? (
              <ActivityIndicator color="#1f1f1f" />
            ) : (
              <>
                <GoogleLogo />
                <Text className="font-sans-medium text-section text-[#1f1f1f]">{googleLabel}</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {error ? <Text className="mt-3 text-center font-sans text-meta text-danger">{error}</Text> : null}

      {children}

      <View className="my-5 flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border" />
        <Text className="font-sans text-meta text-muted-foreground">or</Text>
        <View className="h-px flex-1 bg-border" />
      </View>
    </View>
  );
}

/** Google's standard "G" mark, unaltered colours (branding requirement). */
function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}
