import { Image } from 'expo-image';
import { View } from 'react-native';

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

const SIZES = { sm: 18, md: 26, lg: 34 } as const;

interface ServiceBadgeProps {
  service: ServiceId;
  size?: keyof typeof SIZES;
}

export function ServiceBadge({ service, size = 'md' }: ServiceBadgeProps) {
  const px = SIZES[size];
  return (
    <Image
      source={LOGOS[service]}
      style={{ width: px, height: px, borderRadius: px / 4 }}
      contentFit="contain"
    />
  );
}

/** Overlapping row of service badges (web ServiceStack equivalent). */
export function ServiceStack({
  services,
  size = 'sm',
  max = 3,
}: {
  services: ServiceId[];
  size?: keyof typeof SIZES;
  max?: number;
}) {
  const px = SIZES[size];
  return (
    <View className="flex-row">
      {services.slice(0, max).map((s, i) => (
        <View key={s} style={{ marginLeft: i === 0 ? 0 : -px / 3 }}>
          <ServiceBadge service={s} size={size} />
        </View>
      ))}
    </View>
  );
}
