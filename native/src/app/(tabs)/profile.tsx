import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Bookmark, ChevronRight, Eye, Film, LogOut, MessageSquareText } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedbackSheet } from '@/components/FeedbackSheet';
import { GenreIconTile } from '@/components/GenreIconTile';
import { useUserServices } from '@/hooks/useUserServices';
import { useWatchlist } from '@/hooks/useWatchlist';
import { PROFILE_GLYPHS, type GlyphName } from '@/lib/constants/genreGlyphs';
import { getDefaultTier } from '@/lib/data/platformPricing';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import { useAuth } from '@/providers/auth';

// NATIVE-4 W1 — Profile landing. Aligned to the web ProfilePage: identity,
// stat row, grouped action rows (monochrome glyph tiles), Sign Out. Action
// rows push profile/[section].

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { data: watchlist } = useWatchlist();
  const { data: services } = useUserServices();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const email = session?.user?.email ?? '';
  const name = ((session?.user?.user_metadata?.username as string | undefined) ?? '') || email.split('@')[0] || 'You';
  const initial = (name[0] ?? 'V').toUpperCase();
  const now = new Date();
  const memberSince = `Member since ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const wantCount = (watchlist ?? []).filter((i) => i.status === 'want_to_watch').length;
  const watchedCount = (watchlist ?? []).filter((i) => i.status === 'watched').length;
  const serviceCount = services?.length ?? 0;
  const monthlySpend = (services ?? []).reduce((sum, s) => sum + (getDefaultTier(s)?.price ?? 0), 0);
  const taste = useQuery({ queryKey: ['native', 'tasteProfile'], queryFn: getV2TasteProfile, staleTime: 5 * 60 * 1000 });
  const tasteCount = taste.data?.selectedClusters?.length ?? 0;

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
          <Text className="mt-3 font-sans-bold text-section text-foreground">{name}</Text>
          <Text className="mt-0.5 font-sans text-body text-muted-foreground">{email}</Text>
          <Text className="mt-0.5 font-sans text-kicker text-muted-foreground">{memberSince}</Text>
        </View>

        {/* Stats */}
        <View className="mt-3 flex-row items-center justify-center gap-2">
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
        <ActionRow
          glyph={PROFILE_GLYPHS.spend}
          title="Monthly Spend"
          subtitle={monthlySpend > 0 ? `£${monthlySpend.toFixed(2)} / month` : 'View your spend'}
          onPress={() => go('spend')}
        />

        {/* Personalisation */}
        <SectionLabel>Personalisation</SectionLabel>
        <ActionRow
          glyph={PROFILE_GLYPHS.taste}
          title="Your Taste"
          subtitle={tasteCount > 0 ? `${tasteCount} genre${tasteCount !== 1 ? 's' : ''} selected` : 'Genres you love'}
          onPress={() => go('taste')}
        />
        <ActionRow glyph={PROFILE_GLYPHS.tune} title="Tune Recommendations" subtitle="Balanced across all sliders" onPress={() => go('tune')} />

        {/* Settings */}
        <SectionLabel>Settings</SectionLabel>
        <ActionRow glyph={PROFILE_GLYPHS.appearance} title="Appearance" subtitle="Dark" onPress={() => go('appearance')} />
        <ActionRow glyph={PROFILE_GLYPHS.privacy} title="Privacy & Data" subtitle="Manage your data" onPress={() => go('privacy')} />

        {/* Feedback */}
        <SectionLabel>Feedback</SectionLabel>
        <Pressable
          onPress={() => setFeedbackOpen(true)}
          className="flex-row items-center gap-3 py-3.5 active:opacity-60"
          style={{ borderBottomWidth: 0.5, borderBottomColor: 'rgba(245,241,232,0.10)' }}>
          <View className="h-9 w-9 items-center justify-center rounded-md bg-secondary">
            <MessageSquareText size={18} color="rgba(245,241,232,0.62)" />
          </View>
          <View className="flex-1">
            <Text className="font-sans-bold text-body text-foreground">Send Feedback</Text>
            <Text numberOfLines={1} className="mt-0.5 font-sans text-meta text-muted-foreground">
              Help shape what we build next
            </Text>
          </View>
          <ChevronRight size={18} color="rgba(245,241,232,0.4)" />
        </Pressable>

        {/* Sign out */}
        <Pressable
          onPress={() => signOut()}
          className="mt-6 h-12 flex-row items-center justify-center gap-2 rounded-pill border border-primary-edge bg-primary-soft active:opacity-80">
          <LogOut size={16} color="#e85d25" />
          <Text className="font-sans-bold text-body text-primary">Sign Out</Text>
        </Pressable>

        <Text className="mt-6 text-center font-sans text-meta leading-5 text-faint-foreground">
          Streaming availability from the Streaming Availability API (Movie of the Night). Content data from TMDb.
        </Text>
      </ScrollView>

      <FeedbackSheet visible={feedbackOpen} surface="profile" onClose={() => setFeedbackOpen(false)} />
    </SafeAreaView>
  );
}

function StatTile({ icon, count, label }: { icon: ReactNode; count: number; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5">
      {icon}
      <Text className="font-sans-bold text-body text-foreground">{count}</Text>
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
      className="flex-row items-center gap-3 py-3.5 active:opacity-60"
      style={{ borderBottomWidth: 0.5, borderBottomColor: 'rgba(245,241,232,0.10)' }}>
      <GenreIconTile glyph={glyph} size={36} />
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
