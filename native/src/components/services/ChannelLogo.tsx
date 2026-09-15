import { Image } from 'expo-image';
import { Text, View } from 'react-native';

// Logo square for an add-on channel in the channel sheet (IN-SC-006).
//
// Logos are the TMDb/JustWatch provider images (watch_region=GB, sourced
// 2026-09-15), resized to the same 200x200 RGBA tile as the service logos,
// keyed by `service_addons.channel_id`. The registry is data and can gain a
// channel without a release, so anything not bundled here falls back to a
// letter monogram. Channels that are standalone services never reach this —
// they render their ServiceBadge.
//
// NOW Entertainment has no provider logo of its own; it uses NOW's (Joe).
// require() needs static literals — hence the map.
const CHANNEL_LOGOS: Record<string, number> = {
  acorn_tv: require('../../assets/channels/acorn_tv.png'),
  bfi_player: require('../../assets/channels/bfi_player.png'),
  curzon: require('../../assets/channels/curzon.png'),
  hayu: require('../../assets/channels/hayu.png'),
  itvx_premium: require('../../assets/channels/itvx_premium.png'),
  lionsgate_plus: require('../../assets/channels/lionsgate_plus.png'),
  mgm_plus: require('../../assets/channels/mgm_plus.png'),
  now_cinema: require('../../assets/channels/now_cinema.png'),
  now_entertainment: require('../../assets/now.png'),
  shudder: require('../../assets/channels/shudder.png'),
  studiocanal: require('../../assets/channels/studiocanal.png'),
};

const SIZE = 28;

export function ChannelLogo({ channelId, name }: { channelId: string; name: string }) {
  const logo = CHANNEL_LOGOS[channelId];
  if (logo) {
    // Same shape as ServiceBadge sm: full-bleed, radius ≈ 0.27×.
    return (
      <View style={{ width: SIZE, height: SIZE, borderRadius: Math.round(SIZE * 0.27), overflow: 'hidden' }}>
        <Image source={logo} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      </View>
    );
  }
  return (
    <View className="h-7 w-7 items-center justify-center rounded-md bg-secondary">
      <Text className="font-card text-[13px] text-foreground">{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}
