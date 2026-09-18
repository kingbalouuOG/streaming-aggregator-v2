import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Star } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContentRow } from '@/components/ContentRow';
import { DetailEngagement } from '@/components/DetailEngagement';
import { SectionHead } from '@/components/SectionHead';
import { ShareButton, type ShareMomentState, type ShareTarget } from '@/components/ShareButton';
import { DetailSkeleton } from '@/components/Skeleton';
import { TellSomeoneBanner } from '@/components/TellSomeoneBanner';
import { WatchlistActions } from '@/components/WatchlistActions';
import { Toast, type ToastState } from '@/components/Toast';
import { WhereToWatch } from '@/components/WhereToWatch';
import { useChannelRegistry, useUserChannels } from '@/hooks/useChannels';
import { useContentDetail } from '@/hooks/useContentDetail';
import { useSessionOrigin } from '@/hooks/useSessionOrigin';
import { useUserServices } from '@/hooks/useUserServices';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { buildMomentCopy } from '@/lib/growth/shareCopy';
import { dismissSessionBanner, type SessionOrigin } from '@/lib/instrumentation/sessionOrigin';
import type { ContentItem } from '@/lib/types/content';
import { useClearPendingLinkOnFocus } from '@/pendingLink';
import { useAuth } from '@/providers/auth';

// Arrival and leaving-soon pushes only; a bundle lands on the watchlist and
// carries no title, so it never matches.
function shareMoment(
  origin: SessionOrigin | null,
  contentId: string,
  title: string,
): { banner: string; state: ShareMomentState } | null {
  if (origin?.object?.type !== 'title' || origin.object.id !== contentId || !origin.serviceId) return null;
  if (origin.type !== 'arrival' && origin.type !== 'leaving_soon') return null;
  const copy = buildMomentCopy(
    { type: origin.type, serviceId: origin.serviceId, expiresOn: origin.expiresOn },
    title,
  );
  return copy ? { banner: copy.banner, state: { type: origin.type, line: copy.line } } : null;
}

export default function DetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; title?: string; image?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // The user's connected services scope availability: they prioritise the
  // detail's provider sort AND let "Where to Watch" surface the orange
  // "Watch on X — On your stack" CTA for services the user actually has.
  // Without this the section header ("On your stack.") contradicts a body
  // that lists everything as "Not connected to your account."
  const { data: userServices } = useUserServices();
  // IN-SC-004: held add-on channels join "Watch on …" in Where to Watch.
  const { data: userChannels } = useUserChannels();
  const { data: channelRegistry } = useChannelRegistry();
  const { data, isLoading, isError, error } = useContentDetail(
    params.id,
    serviceIdsToProviderIds(userServices ?? []),
  );
  const [descExpanded, setDescExpanded] = useState(false);
  // IN-SC-006: Where to Watch's "I have this" confirmation (with Undo).
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  // A shared link that opened this title for a signed-in user needs no
  // resume after a later sign-in (native/src/pendingLink.ts). On focus, not
  // on session change: beneath /auth this screen must leave it (IN-GR-040).
  const { session } = useAuth();
  useClearPendingLinkOnFocus(`/detail/${params.id}`, !!session && !!params.id);

  // Growth S4: a push tap that opened this title makes it a share moment.
  const sessionOrigin = useSessionOrigin();

  const heroHeight = (width * 5) / 4;
  const back = () => router.back();

  // Error: clean message + back affordance (no card-poster hero).
  if (isError) {
    return (
      <View className="flex-1 bg-background">
        <BackButton onPress={back} top={insets.top + 12} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center font-standfirst text-section text-foreground">
            Something went wrong
          </Text>
          <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
            {error instanceof Error ? error.message : 'Failed to load details.'}
          </Text>
          <Pressable onPress={back} className="mt-4">
            <Text className="font-sans-bold text-body text-primary">Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Loading: a neutral skeleton — NOT the card poster blown up to hero size.
  // The old "instant header" painted params.image full-bleed, then swapped to
  // the backdrop when data landed, which read as a jarring image flash. The
  // app is fast now, so the skeleton fades straight into the real page.
  if (isLoading || !data) {
    return (
      <View className="flex-1">
        <DetailSkeleton />
        <BackButton onPress={back} top={insets.top + 12} />
      </View>
    );
  }

  const { detail, similar } = data;
  const meta = [
    detail.year ? String(detail.year) : null,
    detail.contentRating,
    detail.runtime,
    detail.seasons ? `${detail.seasons} Season${detail.seasons !== 1 ? 's' : ''}` : null,
    detail.language,
  ].filter(Boolean);

  // Minimal ContentItem for the watchlist toggle. Prefer the poster
  // passed in via params (cards pass the 2:3 poster); fall back to the
  // detail hero image.
  const watchlistItem: ContentItem = {
    id: detail.id,
    title: detail.title,
    image: params.image ?? detail.heroImage,
    services: detail.allServices,
    year: detail.year,
    type: detail.mediaType,
    rating: detail.imdbRating || undefined,
    overview: detail.description,
  };

  // Share copy availability (Growth S4): streaming services, then rent or buy.
  // Add-on channels (detail.channelOptions) never count as the service
  // (migration 084). rentalOptions already leaves out streaming services.
  const shareTarget: ShareTarget = {
    contentId: detail.id,
    title: detail.title,
    year: detail.year,
    availability: {
      subscriptionServices: detail.allServices,
      rentBuyServices: detail.rentalOptions.map((o) => o.serviceKey),
    },
  };

  // "Tell someone": the push that opened this session was about this title.
  const moment = shareMoment(sessionOrigin, detail.id, detail.title);

  return (
    <View className="flex-1 bg-background">
      <Toast toast={toast} top={insets.top + 8} onDismiss={dismissToast} />
      <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator={false}>
        {/* Editorial hero — 4:5 image, Fraunces title overlay */}
        <View style={{ width, height: heroHeight }} className="bg-card">
          <Image
            source={detail.heroImage ? { uri: detail.heroImage } : undefined}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={300}
          />
          <LinearGradient
            colors={['rgba(10,10,15,0)', 'rgba(10,10,15,0.55)', 'rgba(10,10,15,0.95)']}
            locations={[0.35, 0.7, 1]}
            style={{ position: 'absolute', inset: 0 }}
          />
          <BackButton onPress={back} top={insets.top + 12} />
          <ShareButton {...shareTarget} moment={moment?.state} top={insets.top + 12} />
          <Text
            className="absolute inset-x-5 bottom-5 font-display-black text-white"
            style={{ fontSize: 36, lineHeight: 38, letterSpacing: -0.7 }}>
            {detail.title}
          </Text>
        </View>

        <View className="px-5 pt-5">
          {/* Meta line */}
          <Text className="font-sans text-body text-muted-foreground">{meta.join('  ·  ')}</Text>

          {moment && !sessionOrigin?.bannerDismissed ? (
            <TellSomeoneBanner
              text={moment.banner}
              target={{ ...shareTarget, moment: moment.state }}
              onDismiss={dismissSessionBanner}
            />
          ) : null}

          {/* Rating badges */}
          {detail.imdbRating > 0 || detail.rottenTomatoes > 0 ? (
            <View className="mt-3 flex-row gap-2.5">
              {detail.imdbRating > 0 ? (
                <View className="flex-row items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5">
                  <Star size={14} color="#e3b04b" fill="#e3b04b" strokeWidth={0} />
                  <Text className="font-sans-bold text-body text-foreground">
                    {detail.imdbRating.toFixed(1)}
                  </Text>
                  <Text className="font-sans text-kicker text-muted-foreground">IMDb</Text>
                </View>
              ) : null}
              {detail.rottenTomatoes > 0 ? (
                <View className="flex-row items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5">
                  <Image
                    source={require('../../assets/rotten-tomatoes-logo.png')}
                    style={{ width: 16, height: 16 }}
                    contentFit="contain"
                  />
                  <Text className="font-sans-bold text-body text-foreground">
                    {detail.rottenTomatoes}%
                  </Text>
                  <Text className="font-sans text-kicker text-muted-foreground">RT</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Watchlist actions */}
          <WatchlistActions item={watchlistItem} />

          {/* Engagement: thumbs / not-interested / report (+ dwell + detail_view) */}
          <DetailEngagement
            itemId={detail.id}
            title={detail.title}
            mediaType={detail.mediaType}
            genreIds={detail.genreIds}
            services={detail.allServices}
            onBack={back}
          />

          {/* Genre tags */}
          {detail.genres.length > 0 ? (
            <View className="mt-4 flex-row flex-wrap gap-1.5">
              {detail.genres.map((g) => (
                <View key={g} className="rounded-pill bg-secondary px-3 py-1">
                  <Text className="font-sans text-[12px] text-muted-foreground">{g}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Description */}
          {detail.description ? (
            <View className="mt-4">
              <Text
                numberOfLines={descExpanded ? undefined : 3}
                className="font-sans text-body leading-relaxed text-foreground/80">
                {detail.description}
              </Text>
              <Pressable onPress={() => setDescExpanded((v) => !v)} className="mt-1">
                <Text className="font-sans-medium text-meta text-primary">
                  {descExpanded ? 'Show less' : 'Show more'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Where to Watch — the deep-link payoff */}
          <View className="mt-6">
            <WhereToWatch
              detail={detail}
              userServices={userServices ?? []}
              userChannels={userChannels ?? []}
              channelRegistry={channelRegistry ?? []}
              onToast={setToast}
            />
          </View>
        </View>

        {/* Cast */}
        {detail.cast.length > 0 ? (
          <View className="mt-6">
            <View className="px-5">
              <SectionHead kicker="ON SCREEN" title="Cast." />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {detail.cast.map((member, i) => (
                <View key={`${member.name}-${i}`} className="w-[76px] items-center">
                  <View className="mb-2 h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-xl bg-card">
                    {member.image ? (
                      <Image
                        source={{ uri: member.image }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    ) : (
                      <Text className="font-standfirst text-section text-muted-foreground">
                        {member.name[0]}
                      </Text>
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    className="text-center font-sans-bold text-[11px] text-foreground">
                    {member.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 text-center font-sans text-[10px] text-muted-foreground">
                    {member.character}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* More like this */}
        {similar.length > 0 ? (
          <ContentRow
            kicker="THE NEXT THREAD"
            title="More like this."
            items={similar}
            onItemPress={(item) =>
              router.push({
                pathname: '/detail/[id]',
                params: { id: item.id, title: item.title, image: item.image },
              })
            }
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
