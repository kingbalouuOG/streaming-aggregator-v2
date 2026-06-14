import { Mail, User } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/providers/auth';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Account Details (NATIVE-4 W2). Read-only identity for v1;
// editing name + the delete-account flow are follow-ups.
export function ProfileAccount() {
  const { session } = useAuth();
  const user = session?.user;
  const email = user?.email ?? '';
  const name = ((user?.user_metadata?.username as string | undefined) ?? '') || email.split('@')[0] || 'You';
  const created = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : null;

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Account Details" />
      <ScrollView contentContainerClassName="px-5 pb-4 pt-3">
        <Field icon={<User size={18} color="rgba(245,241,232,0.62)" />} label="Username" value={name} />
        <Field icon={<Mail size={18} color="rgba(245,241,232,0.62)" />} label="Email" value={email} />
        {created ? (
          <Text className="mt-5 text-center font-sans text-meta text-muted-foreground">
            Member since {created}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View className="mb-2.5 flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5">
      {icon}
      <View className="flex-1">
        <Text className="font-sans text-kicker uppercase tracking-[1.6px] text-muted-foreground">{label}</Text>
        <Text className="mt-0.5 font-sans-medium text-body text-foreground">{value}</Text>
      </View>
    </View>
  );
}
