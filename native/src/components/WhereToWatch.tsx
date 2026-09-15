import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { ChannelOption, DetailData, RentalOption } from '@/lib/adapters/detailAdapter';
import { getDeepLink } from '@/lib/deepLinks';
import { channelTokensFor, type ChannelRegistryRow } from '@/lib/entitlements/channels';
import { exitDwell, getCurrentDwellSeconds } from '@/lib/instrumentation/dwellTimer';
import { openDeepLink } from '@/lib/openDeepLink';
import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';
import { classifyProviders } from '@/lib/utils/providerClassifier';
import { ServiceBadge } from './ServiceBadge';
import { SectionHead } from './SectionHead';

// Native Where to Watch — 3-tier availability (design-system §6) with
// live deep linking through the shared resolver + native opener
// (openDeepLink.native → RN Linking → Android ACTION_VIEW). The whole
// reason the core loop matters: "Watch on Netflix" fires the intent.

interface WhereToWatchProps {
  detail: DetailData;
  userServices?: ServiceId[];
  /** IN-SC-004: non-standalone add-on channels the user holds. */
  userChannels?: string[];
  channelRegistry?: ChannelRegistryRow[];
}

function isServiceId(id: string): id is ServiceId {
  return id in SERVICE_DISPLAY_NAMES;
}

export function WhereToWatch({ detail, userServices, userChannels, channelRegistry }: WhereToWatchProps) {
  const registry = channelRegistry ?? [];
  const { tier1, tier2, tier3, heldChannels, otherChannels } = classifyProviders(
    detail.allServices,
    detail.rentalOptions,
    userServices ?? [],
    detail.channelOptions ?? [],
    channelTokensFor(registry, userServices ?? [], userChannels ?? []),
  );

  const hasAny =
    tier1.length > 0 ||
    tier2.length > 0 ||
    tier3.length > 0 ||
    heldChannels.length > 0 ||
    otherChannels.length > 0;
  const hasTier1 = tier1.length > 0 || heldChannels.length > 0;

  // A held channel reads as the channel ("Watch on Shudder"), badged as the
  // standalone service when it is one, and says which parent it opens in.
  const heldChannelView = (option: ChannelOption) => {
    const row = registry.find((r) => `${r.parentServiceId}:${r.addonId}` === option.channelToken);
    const standalone = row?.standaloneServiceId;
    return {
      name: row?.displayName ?? option.channelName,
      badge: standalone && isServiceId(standalone) ? standalone : option.serviceKey,
    };
  };

  if (!hasAny) {
    return (
      <View>
        <SectionHead kicker="WHERE TO WATCH" title="Not on your stack." />
        <Text className="font-sans text-body leading-relaxed text-muted-foreground">
          Not currently available to stream in the UK — check back later, availability changes
          frequently.
        </Text>
      </View>
    );
  }

  // `priceShown` is the rent/buy price label exactly as rendered at click
  // time (A2 / roadmap 0.3); null for flat-rate tier-1/tier-2 services,
  // which show no price. Passed straight onto the deep_link_click event.
  const open = async (service: ServiceId, saUrl: string | null, priceShown: string | null = null) => {
    // Platform gates the Prime force-fallback: iOS uses the exact SA
    // Universal Link (reliable), Android keeps the search fallback.
    const link = getDeepLink(
      service,
      saUrl,
      detail.title,
      detail.year,
      Platform.OS === 'ios' ? 'ios' : 'android',
    );
    const { tmdbId } = parseContentItemId(detail.id);
    const dwellSecondsBeforeClick = getCurrentDwellSeconds();
    try {
      await openDeepLink(link.url, {
        contentId: tmdbId,
        mediaType: detail.mediaType,
        serviceId: service,
        dwellSecondsBeforeClick,
        linkType: link.type,
        priceShown,
      });
    } finally {
      exitDwell('deep_link_click');
    }
  };

  return (
    <View>
      <SectionHead kicker="WHERE TO WATCH" title="On your stack." />

      {hasTier1 ? (
        <View className="gap-2">
          {tier1.map((service) => (
            <Pressable
              key={service}
              onPress={() => open(service, detail.serviceLinks[service]?.url ?? null)}
              className="flex-row items-center gap-3 rounded-card border border-primary-edge bg-primary-soft px-4 py-3 active:opacity-80">
              <ServiceBadge service={service} size="md" />
              <Text className="flex-1 font-sans-bold text-body text-foreground">
                Watch on {SERVICE_DISPLAY_NAMES[service]}
              </Text>
              <ExternalLink size={16} color="#e85d25" />
            </Pressable>
          ))}
          {heldChannels.map((option) => {
            const view = heldChannelView(option);
            return (
              <Pressable
                key={option.channelToken ?? `${option.serviceKey}-${option.channelName}`}
                onPress={() => open(option.serviceKey, option.deepLinkUrl ?? null)}
                className="flex-row items-center gap-3 rounded-card border border-primary-edge bg-primary-soft px-4 py-3 active:opacity-80">
                <ServiceBadge service={view.badge} size="md" />
                <View className="flex-1">
                  <Text className="font-sans-bold text-body text-foreground">Watch on {view.name}</Text>
                  <Text className="font-sans text-meta text-muted-foreground">
                    via {SERVICE_DISPLAY_NAMES[option.serviceKey] ?? option.serviceKey}
                  </Text>
                </View>
                <ExternalLink size={16} color="#e85d25" />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {tier2.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-2 font-sans-bold text-kicker uppercase tracking-[1.6px] text-faint-foreground">
            {hasTier1 ? 'Also available on' : 'Available on'}
          </Text>
          <View className="gap-2">
            {tier2.map((service) => (
              <Pressable
                key={service}
                onPress={() => open(service, detail.serviceLinks[service]?.url ?? null)}
                className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3 active:opacity-80">
                <ServiceBadge service={service} size="md" />
                <Text className="flex-1 font-sans-medium text-body text-muted-foreground">
                  {SERVICE_DISPLAY_NAMES[service]}
                </Text>
                <ExternalLink size={16} color="rgba(245,241,232,0.4)" />
              </Pressable>
            ))}
          </View>
          <Text className="mt-2 font-sans text-meta text-faint-foreground">
            Not connected to your account.
          </Text>
        </View>
      ) : null}

      {tier3.length > 0 ? (
        <RentBuyList options={tier3} detail={detail} onOpen={open} />
      ) : null}

      {otherChannels.length > 0 ? <ChannelList options={otherChannels} onOpen={open} /> : null}
    </View>
  );
}

// Paid channels inside a parent service (Prime Video Channels, Apple TV
// Channels, NOW passes) that the user does NOT hold. Shown apart from the
// service chips and labelled, because "on Prime Video" would be wrong for a
// Prime subscriber without the channel. Held channels join tier 1 above
// (IN-SC-004, docs/strategy/briefs/addon-entitlements.md).
function ChannelList({
  options,
  onOpen,
}: {
  options: ChannelOption[];
  onOpen: (service: ServiceId, saUrl: string | null, priceShown: string | null) => void;
}) {
  return (
    <View className="mt-3">
      <Text className="mb-2 font-sans-bold text-kicker uppercase tracking-[1.6px] text-faint-foreground">
        Via a channel
      </Text>
      <View className="gap-2">
        {options.map((option) => (
          <Pressable
            key={`${option.serviceKey}-${option.channelName}`}
            onPress={() => onOpen(option.serviceKey, option.deepLinkUrl ?? null, null)}
            className="flex-row items-center justify-between rounded-card bg-secondary px-3.5 py-3 active:opacity-80">
            <View className="flex-row items-center gap-2.5">
              <ServiceBadge service={option.serviceKey} size="sm" />
              <Text className="font-sans-medium text-body text-foreground">{option.channelName}</Text>
            </View>
            <Text className="font-sans-medium text-meta text-muted-foreground">
              on {SERVICE_DISPLAY_NAMES[option.serviceKey] ?? option.serviceKey}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text className="mt-1.5 font-sans text-meta text-muted-foreground">
        Needs a subscription to the channel, not just the service it sits in.
      </Text>
    </View>
  );
}

function RentBuyList({
  options,
  detail,
  onOpen,
}: {
  options: RentalOption[];
  detail: DetailData;
  onOpen: (service: ServiceId, saUrl: string | null, priceShown: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? options : options.slice(0, 3);

  // The exact price label rendered for a rent/buy row — reused for both
  // display and the deep_link_click `price_shown` field so they can never
  // drift apart.
  const priceLabel = (option: RentalOption): string =>
    option.price.startsWith('£')
      ? `${option.type === 'rent' ? 'Rent from' : 'Buy from'} ${option.price}`
      : option.price;

  return (
    <View className="mt-3">
      <Text className="mb-2 font-sans-bold text-kicker uppercase tracking-[1.6px] text-faint-foreground">
        Rent or Buy
      </Text>
      <View className="gap-2">
        {visible.map((option, i) => (
          <Pressable
            key={`${option.serviceKey}-${option.type}-${i}`}
            onPress={() =>
              onOpen(
                option.serviceKey,
                option.deepLinkUrl ?? detail.serviceLinks[option.serviceKey]?.url ?? null,
                priceLabel(option),
              )
            }
            className="flex-row items-center justify-between rounded-card bg-secondary px-3.5 py-3 active:opacity-80">
            <View className="flex-row items-center gap-2.5">
              <ServiceBadge service={option.serviceKey} size="sm" />
              <Text className="font-sans-medium text-body text-foreground">
                {SERVICE_DISPLAY_NAMES[option.serviceKey] ?? option.service}
              </Text>
            </View>
            <Text className="font-sans-medium text-meta text-primary">{priceLabel(option)}</Text>
          </Pressable>
        ))}
      </View>
      {options.length > 3 ? (
        <Pressable onPress={() => setShowAll((v) => !v)} className="mt-1.5">
          <Text className="font-sans-bold text-meta text-primary">
            {showAll ? 'Show less' : `Show ${options.length - 3} more`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
