import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ExternalLink, Star } from 'lucide-react-native';
import { Platform, Pressable, Text, View } from 'react-native';

import { useItemServices } from '@/hooks/useItemServices';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { getStreamingLinks, type StreamingLink } from '@/lib/api/supabaseContent';
import { contentMediaType } from '@/lib/content/documentary';
import { getDeepLink } from '@/lib/deepLinks';
import { exitDwell, getCurrentDwellSeconds } from '@/lib/instrumentation/dwellTimer';
import { openDeepLink } from '@/lib/openDeepLink';
import { SERVICE_DISPLAY_NAMES, type ContentItem, type ServiceId } from '@/lib/types/content';
import { ServiceBadge } from './ServiceBadge';

// The confident-title-hit layout (recommendation 2026-09-08-002 §9.2, state 2
// of the prototype).
//
// When someone types a title, they are retrieving, not discovering: they
// heard about it from a friend (the first discovery source for 56–68% of GB
// adults, §8.1) and they want to know where it is and how to start it. So the
// answer is a wide card with where-to-watch and the open button first, and
// the rest of the matches as an ordinary grid underneath. No refine row —
// there is nothing to refine about a title you have already named.
//
// Deliberately NOT a detail fetch. `getStreamingLinks` is one cached query
// against the content cache, which is what carries both the exact deep link
// and the stream type; the full `DetailData` the detail screen builds would
// cost several more calls to render a card the user is about to leave.

/** Stream types that mean "no marginal cost", as everywhere else. */
const INCLUDED = new Set<StreamingLink['streamType']>(['subscription', 'free']);

export function TitleHitCard({
  item,
  userServices,
  onOpenDetail,
}: {
  item: ContentItem;
  userServices: ServiceId[];
  onOpenDetail: (item: ContentItem) => void;
}) {
  const { tmdbId, mediaType } = parseContentItemId(item.id);
  const { data: links } = useQuery({
    queryKey: ['native', 'streamingLinks', mediaType, tmdbId],
    queryFn: () => getStreamingLinks(tmdbId, mediaType),
    enabled: tmdbId > 0,
    staleTime: 30 * 60 * 1000,
  });

  // Badges fall back to the lazy TMDb resolver when the content cache has no
  // row for this title — a card with no availability at all reads as "not
  // available", which is a different and usually wrong claim.
  const fallbackServices = useItemServices(item, 3);
  const best = pickBestLink(links, userServices);
  const shownServices = links?.length
    ? [...new Set(links.map((l) => l.serviceId))].slice(0, 3)
    : fallbackServices;

  const open = async () => {
    if (!best) return;
    const link = getDeepLink(
      best.serviceId,
      best.deepLinkUrl,
      item.title,
      item.year,
      Platform.OS === 'ios' ? 'ios' : 'android',
    );
    try {
      await openDeepLink(link.url, {
        contentId: tmdbId,
        mediaType,
        serviceId: best.serviceId,
        dwellSecondsBeforeClick: getCurrentDwellSeconds(),
        linkType: link.type,
        priceShown: best.priceFormatted ?? null,
      });
    } finally {
      exitDwell('deep_link_click');
    }
  };

  return (
    <View className="px-5 pt-3">
      <Pressable
        onPress={() => onOpenDetail(item)}
        accessibilityRole="button"
        className="flex-row gap-3.5 rounded-card border border-border bg-card p-3 active:opacity-90">
        <View
          className="overflow-hidden rounded-lg bg-secondary"
          style={{ width: 96, height: 144 }}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : null}
        </View>

        <View className="flex-1 justify-between">
          <View>
            <Text numberOfLines={2} className="font-display-bold text-section text-foreground">
              {item.title}
            </Text>
            <Text className="mt-1 font-sans-medium text-kicker uppercase tracking-[0.3px] text-muted-foreground">
              {metaLine(item)}
            </Text>
            {item.rating ? (
              <View className="mt-1.5 flex-row items-center gap-1.5">
                <Star size={12} color="#fbbf24" fill="#fbbf24" />
                <Text className="font-sans-bold text-meta text-foreground">
                  {item.rating.toFixed(1)}
                </Text>
              </View>
            ) : null}
          </View>

          {shownServices.length > 0 ? (
            <View>
              <Text className="mb-1.5 font-sans-bold text-kicker uppercase tracking-[1.2px] text-faint-foreground">
                Where to watch
              </Text>
              <View className="flex-row items-center gap-1.5">
                {shownServices.map((service) => (
                  <ServiceBadge key={service} service={service} size="sm" />
                ))}
                {best && INCLUDED.has(best.streamType) ? (
                  <Text className="ml-0.5 font-sans-medium text-meta text-success">Included</Text>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </Pressable>

      {best ? (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          className="mt-2.5 min-h-[48px] flex-row items-center justify-center gap-2.5 rounded-card bg-primary px-4 py-3.5 active:opacity-90">
          <ExternalLink size={16} color="#ffffff" />
          <Text className="font-sans-bold text-body text-white">
            Open in {SERVICE_DISPLAY_NAMES[best.serviceId]}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** "TV · 2022 · Thriller" — whatever of it we actually know. */
function metaLine(item: ContentItem): string {
  const parts: string[] = [contentMediaType(item) === 'tv' ? 'TV' : 'Film'];
  if (item.year) parts.push(String(item.year));
  if (item.genre) parts.push(item.genre);
  return parts.join(' · ');
}

/**
 * Which service the big button opens.
 *
 * Order: included on a service the user pays for → included anywhere →
 * anything at all. "On your stack and costs nothing more" is the only answer
 * that is unambiguously right, and putting a rental first would turn a
 * search result into a sales pitch.
 */
function pickBestLink(
  links: StreamingLink[] | undefined,
  userServices: ServiceId[],
): StreamingLink | null {
  if (!links?.length) return null;
  const mine = new Set(userServices);
  return (
    links.find((l) => INCLUDED.has(l.streamType) && mine.has(l.serviceId)) ??
    links.find((l) => INCLUDED.has(l.streamType)) ??
    links[0]
  );
}
