import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentRow } from '@/components/ContentRow';
import { SectionHead } from '@/components/SectionHead';
import { WatchlistActions } from '@/components/WatchlistActions';
import { WhereToWatch } from '@/components/WhereToWatch';
import { useContentDetail } from '@/hooks/useContentDetail';
import type { ContentItem } from '@/lib/types/content';

export default function DetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; title?: string; image?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { data, isLoading, isError, error } = useContentDetail(params.id);
  const [descExpanded, setDescExpanded] = useState(false);

  const heroHeight = (width * 5) / 4;
  const back = () => router.back();

  // Loading: paint the known title/image from the card immediately
  // (passed as params), spinner for the enriched body — same instant-
  // header trick as the web detail page.
  if (isLoading || !data) {
    return (
      <View className="flex-1 bg-background">
        <View style={{ width, height: heroHeight }} className="bg-card">
          {params.image ? (
            <Image
              source={{ uri: params.image }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : null}
          <LinearGradient
            colors={['rgba(10,10,15,0)', 'rgba(10,10,15,0.55)', 'rgba(10,10,15,0.95)']}
            locations={[0.35, 0.7, 1]}
            style={{ position: 'absolute', inset: 0 }}
          />
          <BackButton onPress={back} top={insets.top + 12} />
          {params.title ? (
            <Text
              className="absolute inset-x-5 bottom-5 font-display-black text-white"
              style={{ fontSize: 36, lineHeight: 38, letterSpacing: -0.7 }}>
              {params.title}
            </Text>
          ) : null}
        </View>
        {isError ? (
          <View className="items-center px-8 pt-10">
            <Text className="text-center font-display text-section text-foreground">
              Something went wrong
            </Text>
            <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
              {error instanceof Error ? error.message : 'Failed to load details.'}
            </Text>
            <Pressable onPress={back} className="mt-4">
              <Text className="font-sans-bold text-body text-primary">Go back</Text>
            </Pressable>
          </View>
        ) : (
          <View className="items-center pt-10">
            <ActivityIndicator color="#e85d25" />
          </View>
        )}
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

  return (
    <View className="flex-1 bg-background">
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
          <Text
            className="absolute inset-x-5 bottom-5 font-display-black text-white"
            style={{ fontSize: 36, lineHeight: 38, letterSpacing: -0.7 }}>
            {detail.title}
          </Text>
        </View>

        <View className="px-5 pt-5">
          {/* Meta line */}
          <Text className="font-sans text-body text-muted-foreground">{meta.join('  ·  ')}</Text>

          {/* Rating badges */}
          {detail.imdbRating > 0 || detail.rottenTomatoes > 0 ? (
            <View className="mt-3 flex-row gap-2.5">
              {detail.imdbRating > 0 ? (
                <View className="flex-row items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5">
                  <Text className="text-star">★</Text>
                  <Text className="font-sans-bold text-body text-foreground">
                    {detail.imdbRating.toFixed(1)}
                  </Text>
                  <Text className="font-sans text-kicker text-muted-foreground">IMDb</Text>
                </View>
              ) : null}
              {detail.rottenTomatoes > 0 ? (
                <View className="flex-row items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5">
                  <Text className="text-[13px]">🍅</Text>
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
            <WhereToWatch detail={detail} />
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
                      <Text className="font-display text-section text-muted-foreground">
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

function BackButton({ onPress, top }: { onPress: () => void; top: number }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ top }}
      className="absolute left-4 h-9 w-9 items-center justify-center rounded-md bg-[#14141c]/60 active:bg-[#14141c]">
      <ArrowLeft size={20} color="#ffffff" />
    </Pressable>
  );
}
