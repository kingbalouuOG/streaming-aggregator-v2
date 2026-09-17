import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { useAuth, type ProviderSignInResult } from '@/providers/auth';

// Apple and Google sign-in (Growth S3), shared by the sign-in screen and
// onboarding Step 1: the buttons, their own error line, an optional slot
// (Step 1's terms line) and the "or" divider above the email form. Renders
// nothing when neither provider is available, so the email form reads
// exactly as before.
//
// Apple: a custom button (IN-GR-032), iOS only. The system
// AppleAuthenticationButton sizes its title from its height and exposes no
// font size, so it could not sit beside Google at a matching label size.
// Rules applied, from Apple's HIG "Sign in with Apple" > "Creating a custom
// Sign in with Apple button" (read 17 Sept 2026):
// - Logo: Apple's downloadable artwork only (Apple Design Resources,
//   Logo-Sign-in-with-Apple.dmg, "Logo - SIWA - Left-aligned - Black -
//   Medium.svg"), path and 31x44 frame copied unaltered. The file's height
//   matches the button height (44), no crop, no added vertical padding; its
//   built-in horizontal padding is the logo-to-title margin. Medium, so the
//   glyph (19pt) sits with the 19pt title.
// - Title: "Sign in with Apple" / "Continue with Apple" only, default
//   capitalisation. The HIG prefers the system font but allows a custom one,
//   so it is DM Sans medium like Google's label.
// - Proportion: whatever the font, the title is 43% of the button height, as
//   the system button draws it: 44pt tall -> 19pt title (44 x 0.43 = 18.9).
//   This is why both buttons are 44pt (Apple's default and recommended
//   height) with 19pt labels rather than 56pt with 18pt. Heights are
//   `h-[44px]`, not `h-11`: NativeWind's native rem is 14, so h-11 is 38.5pt
//   and the 44pt logo file would overhang the button.
// - Colours: white style (Videx is dark; black is ruled out on dark
//   backgrounds). White fill, black logo, black title; no custom colours.
// - Shape: rectangular, corner radius matching the app's buttons (12pt
//   `rounded-card`), which the HIG allows.
// - Size and margins: at least 140pt wide and 30pt tall; at least 1/10 of
//   the height (4.4pt) clear around the button (the 12pt gap and the screen
//   gutter); the title keeps at least 8% of the button width to its right
//   edge (content is centred in a full-width button).
// - Prominence: no smaller than the other sign-in button (same size as
//   Google), above it, visible without scrolling.
// Google: a custom button inside Google's branding rules (the standard
// four-colour "G", light theme: #FFFFFF fill, 1px #747775 stroke, #1F1F1F
// label, "Sign in with / Continue with Google"), at the same height, card
// radius and label size as Apple so the two read as a pair.

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
  const appleLabel = verb === 'signIn' ? 'Sign in with Apple' : 'Continue with Apple';
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
          <Pressable
            onPress={() => void run('apple', signInWithApple)}
            disabled={inactive}
            accessibilityRole="button"
            accessibilityLabel={appleLabel}
            style={{ opacity: inactive && busy !== 'apple' ? 0.5 : 1 }}
            className="h-[44px] flex-row items-center justify-center rounded-card bg-white active:opacity-90">
            {busy === 'apple' ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <>
                <AppleLogo />
                <Text className="font-sans-medium text-[19px] text-black">{appleLabel}</Text>
              </>
            )}
          </Pressable>
        ) : null}

        {isGoogleAvailable ? (
          <Pressable
            onPress={() => void run('google', signInWithGoogle)}
            disabled={inactive}
            accessibilityRole="button"
            accessibilityLabel={googleLabel}
            style={{ opacity: inactive && busy !== 'google' ? 0.5 : 1 }}
            className="h-[44px] flex-row items-center justify-center gap-3 rounded-card border border-[#747775] bg-white active:opacity-90">
            {busy === 'google' ? (
              <ActivityIndicator color="#1f1f1f" />
            ) : (
              <>
                <GoogleLogo />
                <Text className="font-sans-medium text-[19px] text-[#1f1f1f]">{googleLabel}</Text>
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

/** Apple's "Left-aligned - Black - Medium" logo file, unaltered: the path,
 *  its white frame and its 31x44 size (the button height) come straight from
 *  Apple Design Resources. Never redraw or crop it (HIG). */
function AppleLogo() {
  return (
    <Svg width={31} height={44} viewBox="0 0 31 44" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={0} y={0} width={31} height={44} fill="#FFFFFF" />
      <Path
        fill="#000000"
        d="M15.7099491,14.8846154 C16.5675461,14.8846154 17.642562,14.3048315 18.28274,13.5317864 C18.8625238,12.8312142 19.2852829,11.852829 19.2852829,10.8744437 C19.2852829,10.7415766 19.2732041,10.6087095 19.2490464,10.5 C18.2948188,10.5362365 17.1473299,11.140178 16.4588366,11.9494596 C15.9152893,12.56548 15.4200572,13.5317864 15.4200572,14.5222505 C15.4200572,14.6671964 15.4442149,14.8121424 15.4562937,14.8604577 C15.5166879,14.8725366 15.6133185,14.8846154 15.7099491,14.8846154 Z M12.6902416,29.5 C13.8618881,29.5 14.3812778,28.714876 15.8428163,28.714876 C17.3285124,28.714876 17.6546408,29.4758423 18.9591545,29.4758423 C20.2395105,29.4758423 21.0971074,28.292117 21.9063891,27.1325493 C22.8123013,25.8038779 23.1867451,24.4993643 23.2109027,24.4389701 C23.1263509,24.4148125 20.6743484,23.4122695 20.6743484,20.5979021 C20.6743484,18.1579784 22.6069612,17.0588048 22.7156707,16.974253 C21.4353147,15.1382708 19.490623,15.0899555 18.9591545,15.0899555 C17.5217737,15.0899555 16.3501271,15.9596313 15.6133185,15.9596313 C14.8161157,15.9596313 13.7652575,15.1382708 12.521138,15.1382708 C10.1536872,15.1382708 7.75,17.0950413 7.75,20.7911634 C7.75,23.0861411 8.64383344,25.513986 9.74300699,27.0842339 C10.6851558,28.4129053 11.5065162,29.5 12.6902416,29.5 Z"
      />
    </Svg>
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
