import { useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ResendConfirmation } from '@/components/auth/ResendConfirmation';

// Onboarding Step 1, after an email sign-up while "Confirm email" is on
// (Growth S3 follow-up, IN-GR-011): signUp returned no session, so there is
// no account to continue with yet. The emailed link opens confirm-email.tsx,
// which signs the person in and steps back here; OnboardingFlow then carries
// on to Connect Services with the age and viewing answers already given.

export function CheckEmail({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  const router = useRouter();

  // Back to the sign-in screen beneath onboarding (Create one pushed us from
  // there), with the address filled in.
  const signIn = () => {
    const href = { pathname: '/auth', params: { email } } as const;
    if (router.canDismiss()) router.dismissTo(href);
    else router.replace(href);
  };

  return (
    <ScrollView contentContainerClassName="grow px-6 pt-10 pb-6" showsVerticalScrollIndicator={false}>
      <View className="items-center">
        <View className="h-16 w-16 items-center justify-center rounded-[20px] bg-primary">
          <Mail size={30} color="#ffffff" strokeWidth={2} />
        </View>
        <Text className="mt-4 font-display-bold text-headline text-foreground">Check your email</Text>
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          We sent a link to <Text className="font-sans-bold text-foreground">{email}</Text>. Open it on this phone to
          confirm your account and carry on setting up Videx.
        </Text>
      </View>

      <View className="mt-8">
        <ResendConfirmation email={email} />
      </View>

      <Pressable onPress={signIn} className="mt-6 self-center" hitSlop={8}>
        <Text className="font-sans-bold text-body text-primary">Already confirmed? Sign in</Text>
      </Pressable>
      <Pressable onPress={onChangeEmail} className="mt-4 self-center" hitSlop={8}>
        <Text className="font-sans-medium text-meta text-muted-foreground">Use a different email</Text>
      </Pressable>

      <Text className="mt-auto pt-8 text-center font-sans text-meta text-muted-foreground">
        No email after a few minutes? Check your spam folder, or resend the link.
      </Text>
    </ScrollView>
  );
}
