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

interface ServiceBadgeProps {
  service: ServiceId;
  size?: keyof typeof SIZES;
}

// Web-parity render: cover-fit the logo edge-to-edge (full bleed), round the
// corners, NO background and NO border. A border framed coloured logos
// (Prime/Disney/Sky/Paramount) with a dark ring; in a stack the overlap
// separation is handled by z-order, not a ring (Joe, 2026-06-17).
export function ServiceBadge({ service, size = 'md' }: ServiceBadgeProps) {
  const px = SIZES[size];
  return (
    <View
      style={{
        width: px,
        height: px,
        borderRadius: Math.round(px * 0.27),
        overflow: 'hidden',
      }}>
      <Image source={LOGOS[service]} style={{ width: '100%', height: '100%' }} contentFit="cover" />
    </View>
  );
}

/** Overlapping row of service badges (web ServiceStack equivalent): up to
 *  `max` logos at -32% overlap (first badge on top, web-style), then a `+N`
 *  overflow chip. No separator ring — logos sit flush + full-bleed. */
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
        <View key={s} style={{ marginLeft: i === 0 ? 0 : -px * 0.32, zIndex: shown.length - i }}>
          <ServiceBadge service={s} size={size} />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={{
            marginLeft: -px * 0.32,
            zIndex: 0,
            width: px,
            height: px,
            borderRadius: radius,
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
