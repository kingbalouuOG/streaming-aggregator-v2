import { useRouter } from 'expo-router';
import { Bookmark, ChevronRight, Eye, Film, LogOut } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GenreIconTile } from '@/components/GenreIconTile';
import { useUserServices } from '@/hooks/useUserServices';
import { useWatchlist } from '@/hooks/useWatchlist';
import { PROFILE_GLYPHS, type GlyphName } from '@/lib/constants/genreGlyphs';
import { useAuth } from '@/providers/auth';

// NATIVE-4 W1 — Profile main page (matches V2 Profile_Profile Page.png).
// Header + avatar + stats + grouped action rows + Sign Out. Action rows
// push profile/[section] (stub until W2 fills the sub-screens).

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { data: watchlist } = useWatchlist();
  const { data: services } = useUserServices();

  const email = session?.user?.email ?? '';
  const name = ((session?.user?.user_metadata?.username as string | undefined) ?? '') || email.split('@')[0] || 'You';
  const initial = (name[0] ?? 'V').toUpperCase();

  const wantCount = (watchlist ?? []).filter((i) => i.status === 'want_to_watch').length;
  const watchedCount = (watchlist ?? []).filter((i) => i.status === 'watched').length;
  const serviceCount = services?.length ?? 0;

  const go = (section: string) =>
    router.push({ pathname: '/profile/[section]', params: { section } });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-5 pb-6" showsVerticalScrollIndicator={false}>
        <Text className="pt-2 font-display-black text-headline text-foreground">Profile</Text>

        {/* Avatar + identity */}
        <View className="mt-4 items-center">
          <View
            className="h-20 w-20 items-center justify-center rounded-full bg-primary"
            style={{ shadowColor: '#e85d25', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } }}>
            <Text className="font-display-bold text-[32px] text-white">{initial}</Text>
          </View>
          <Text className="mt-3 font-display-bold text-title text-foreground">{name}</Text>
          <Text className="mt-0.5 font-sans text-body text-muted-foreground">{email}</Text>
        </View>

        {/* Stats */}
        <View className="mt-5 flex-row gap-2.5">
          <StatTile icon={<Bookmark size={15} color="#e85d25" />} count={wantCount} label="Watchlist" />
          <StatTile icon={<Eye size={15} color="rgba(245,241,232,0.62)" />} count={watchedCount} label="Watched" />
          <StatTile icon={<Film size={15} color="rgba(245,241,232,0.62)" />} count={serviceCount} label="Services" />
        </View>

        {/* Account */}
        <SectionLabel>Account</SectionLabel>
        <ActionRow glyph={PROFILE_GLYPHS.account} title="Account Details" subtitle={email} onPress={() => go('account')} />

        {/* Subscriptions */}
        <SectionLabel>Subscriptions</SectionLabel>
        <ActionRow
          glyph={PROFILE_GLYPHS.streaming}
          title="Streaming Services"
          subtitle={`${serviceCount} service${serviceCount !== 1 ? 's' : ''} connected`}
          onPress={() => go('services')}
        />
        <ActionRow glyph={PROFILE_GLYPHS.spend} title="Monthly Spend" subtitle="View your spend" onPress={() => go('spend')} />

        {/* Personalisation */}
        <SectionLabel>Personalisation</SectionLabel>
        <ActionRow glyph={PROFILE_GLYPHS.taste} title="Your Taste" subtitle="Genres you love" onPress={() => go('taste')} />
        <ActionRow glyph={PROFILE_GLYPHS.tune} title="Tune Recommendations" subtitle="Adjust how we pick" onPress={() => go('tune')} />

        {/* Settings */}
        <SectionLabel>Settings</SectionLabel>
        <ActionRow glyph={PROFILE_GLYPHS.appearance} title="Appearance" subtitle="Dark" onPress={() => go('appearance')} />
        <ActionRow glyph={PROFILE_GLYPHS.privacy} title="Privacy & Data" subtitle="Manage your data" onPress={() => go('privacy')} />

        {/* Sign out */}
        <Pressable
          onPress={() => signOut()}
          className="mt-6 h-14 flex-row items-center justify-center gap-2 rounded-card border border-destructive/40 bg-destructive/10 active:bg-destructive/20">
          <LogOut size={18} color="#d4183d" />
          <Text className="font-sans-bold text-section text-destructive">Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ icon, count, label }: { icon: ReactNode; count: number; label: string }) {
  return (
    <View className="flex-1 items-center rounded-card border border-border bg-card py-3">
      {icon}
      <Text className="mt-1 font-display-bold text-title text-foreground">{count}</Text>
      <Text className="font-sans text-kicker text-muted-foreground">{label}</Text>
    </View>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="mb-2 mt-5 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
      {children}
    </Text>
  );
}

function ActionRow({
  glyph,
  title,
  subtitle,
  onPress,
}: {
  glyph: GlyphName;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center gap-3 rounded-card border border-border bg-card p-3.5 active:bg-secondary">
      <GenreIconTile glyph={glyph} size={40} />
      <View className="flex-1">
        <Text className="font-sans-bold text-body text-foreground">{title}</Text>
        <Text numberOfLines={1} className="mt-0.5 font-sans text-meta text-muted-foreground">
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={18} color="rgba(245,241,232,0.4)" />
    </Pressable>
  );
}
