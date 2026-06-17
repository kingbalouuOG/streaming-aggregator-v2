import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import type { ServiceId } from '@/lib/types/content';

// Service logo badge over the junctioned shared assets (native/src/assets
// -> src/assets; relative paths because the template's '@/assets/*' alias
// points at native/assets). require() needs static literals — hence the map.
const LOGOS: Record<ServiceId, number> = {
  netflix: require('../assets/netflix.png'),
  prime: require('../assets/prime.png'),
  apple: require('../assets/apple.png'),
  disney: require('../assets/disney.png'),
  now: require('../assets/now.png'),
  skygo: require('../assets/skygo.png'),
  paramount: require('../assets/paramount.png'),
  bbc: require('../assets/bbc.png'),
  itvx: require('../assets/itvx.png'),
  channel4: require('../assets/channel4.png'),
};

// Design system: standalone ServiceBadge sm 28 / md 38 / lg 48; xs 22 is the
// in-card ServiceStack size. Radius ≈ 0.27× (spec radius-sm 10px @ md).
const SIZES = { xs: 22, sm: 28, md: 38, lg: 48 } as const;
// Ring color = the card surface, so overlapping stack badges read as layered.
const RING = '#14141c';

interface ServiceBadgeProps {
  service: ServiceId;
  size?: keyof typeof SIZES;
  /** 1.5px card-bg ring — used inside ServiceStack for overlap separation. */
  ring?: boolean;
}

export function ServiceBadge({ service, size = 'md', ring = false }: ServiceBadgeProps) {
  const px = SIZES[size];
  // Matches the web ServiceBadge exactly: cover-fit the logo to the box,
  // round the corners, NO background and NO overscale. The earlier overscale
  // enlarged/off-centred the logo; the earlier black bg framed it.
  return (
    <View
      style={{
        width: px,
        height: px,
        borderRadius: Math.round(px * 0.27),
        overflow: 'hidden',
        ...(ring ? { borderWidth: 1.5, borderColor: RING } : null),
      }}>
      <Image source={LOGOS[service]} style={{ width: '100%', height: '100%' }} contentFit="cover" />
    </View>
  );
}

/** Overlapping row of service badges (web ServiceStack equivalent): up to
 *  `max` logos, then a `+N` overflow chip. -32% overlap + 1.5px ring. */
export function ServiceStack({
  services,
  size = 'xs',
  max = 3,
}: {
  services: ServiceId[];
  size?: keyof typeof SIZES;
  max?: number;
}) {
  const px = SIZES[size];
  const shown = services.slice(0, max);
  const overflow = services.length - shown.length;
  const radius = Math.round(px * 0.27);
  return (
    <View className="flex-row items-center">
      {shown.map((s, i) => (
        <View key={s} style={{ marginLeft: i === 0 ? 0 : -px * 0.32 }}>
          <ServiceBadge service={s} size={size} ring />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={{
            marginLeft: -px * 0.32,
            width: px,
            height: px,
            borderRadius: radius,
            borderWidth: 1.5,
            borderColor: RING,
            backgroundColor: '#23232e',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text className="font-sans-bold text-foreground" style={{ fontSize: Math.round(px * 0.4) }}>
            +{overflow}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
