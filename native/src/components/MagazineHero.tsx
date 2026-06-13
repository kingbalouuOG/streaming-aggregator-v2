import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Bookmark, Info, Play } from 'lucide-react-native';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SERVICE_DISPLAY_NAMES, type ContentItem, type ServiceId } from '@/lib/types/content';
import { ServiceBadge, ServiceStack } from './ServiceBadge';

// MagazineHero — native port of the web component (design-system §4).
// Anatomy top->bottom: dash+kicker / service badge top-right / Fraunces
// 36 title / standfirst / CTA row (Play pill + glass bookmark/info) /
// meta line. 4:5 poster with a 3-stop bottom gradient.

interface MagazineHeroProps {
  item: ContentItem;
  kicker?: string;
  standfirst?: string;
  onSelect?: (item: ContentItem) => void;
  bookmarked?: boolean;
  onToggleBookmark?: (item: ContentItem) => void;
  onMoreInfo?: (item: ContentItem) => void;
}

export function MagazineHero({
  item,
  kicker = "TODAY'S PICK",
  standfirst,
  onSelect,
  bookmarked = false,
  onToggleBookmark,
  onMoreInfo,
}: MagazineHeroProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Full-bleed under the status bar (the Home screen has no SafeAreaView
  // top edge) — the poster extends behind the clock; chrome offsets in.
  const height = (width * 5) / 4 + insets.top;
  const chromeTop = insets.top + 12;

  const services = item.services as ServiceId[];
  const primaryService = services[0];

  const meta: string[] = [];
  if (item.year) meta.push(String(item.year));
  if (item.runtime) meta.push(`${item.runtime}m`);
  if (item.genre) meta.push(item.genre);

  return (
    <Pressable onPress={onSelect ? () => onSelect(item) : undefined}>
      <View style={{ width, height }} className="overflow-hidden bg-card">
        <Image
          source={item.image ? { uri: item.image } : undefined}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={300}
          priority="high"
        />

        {/* Top scrim — keeps the status-bar icons readable over bright art */}
        <LinearGradient
          colors={['rgba(10,10,15,0.6)', 'rgba(10,10,15,0)']}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: insets.top + 44 }}
        />

        {/* Bottom gradient — read the title block */}
        <LinearGradient
          colors={['rgba(10,10,15,0)', 'rgba(10,10,15,0.55)', 'rgba(10,10,15,0.95)']}
          locations={[0.3, 0.65, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />

        {/* Top-left: dash + kicker */}
        <View className="absolute left-4 flex-row items-center gap-2" style={{ top: chromeTop }}>
          <View style={{ width: 14, height: 1.5, borderRadius: 1 }} className="bg-foreground" />
          <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-foreground">
            {kicker}
          </Text>
        </View>

        {/* Top-right: primary service badge */}
        {primaryService ? (
          <View className="absolute right-4" style={{ top: chromeTop }}>
            <ServiceBadge service={primaryService} size="md" />
          </View>
        ) : null}

        {/* Title block — bottom-aligned */}
        <View className="absolute inset-x-0 bottom-0 gap-2 p-5">
          <Text
            numberOfLines={3}
            className="font-display-black text-white"
            style={{ fontSize: 36, lineHeight: 38, letterSpacing: -0.7 }}>
            {item.title}
          </Text>

          {standfirst ? (
            <Text numberOfLines={3} className="font-sans text-body leading-5 text-white/85">
              {standfirst}
            </Text>
          ) : null}

          {/* CTA row — Play pill + bookmark + info */}
          <View className="mt-1 flex-row items-center gap-2">
            {primaryService ? (
              <Pressable
                onPress={onSelect ? () => onSelect(item) : undefined}
                className="flex-row items-center gap-2 rounded-pill bg-white/95 px-4 py-2.5 active:bg-white/80">
                <Play size={15} color="#0a0a0f" fill="#0a0a0f" strokeWidth={0} />
                <Text className="font-sans-bold text-body text-[#0a0a0f]">
                  Play on {SERVICE_DISPLAY_NAMES[primaryService]}
                </Text>
              </Pressable>
            ) : null}
            {onToggleBookmark ? (
              <Pressable
                onPress={() => onToggleBookmark(item)}
                className="h-9 w-9 items-center justify-center rounded-md bg-[#14141c]/80 active:bg-[#14141c]">
                <Bookmark
                  size={16}
                  color="#ffffff"
                  fill={bookmarked ? '#ffffff' : 'transparent'}
                  strokeWidth={2}
                />
              </Pressable>
            ) : null}
            {onMoreInfo ? (
              <Pressable
                onPress={() => onMoreInfo(item)}
                className="h-9 w-9 items-center justify-center rounded-md bg-[#14141c]/80 active:bg-[#14141c]">
                <Info size={16} color="#ffffff" strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>

          {/* Meta line — year · runtime · genre · ★ rating */}
          <View className="mt-1 flex-row flex-wrap items-center gap-2">
            <Text className="font-sans text-meta text-white/70">
              {meta.join(' · ')}
              {item.rating != null && item.rating > 0 ? (
                <>
                  {meta.length > 0 ? ' · ' : ''}
                  <Text className="text-star">★</Text>
                  <Text> {item.rating.toFixed(1)}</Text>
                </>
              ) : null}
            </Text>
            {services.length > 1 ? (
              <View className="ml-auto">
                <ServiceStack services={services.slice(1)} size="sm" max={3} />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
