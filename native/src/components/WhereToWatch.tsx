import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { DetailData, RentalOption } from '@/lib/adapters/detailAdapter';
import { getDeepLink } from '@/lib/deepLinks';
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
}

export function WhereToWatch({ detail, userServices }: WhereToWatchProps) {
  const { tier1, tier2, tier3 } = classifyProviders(
    detail.allServices,
    detail.rentalOptions,
    userServices ?? [],
  );

  const hasAny = tier1.length > 0 || tier2.length > 0 || tier3.length > 0;

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

  const open = async (service: ServiceId, saUrl: string | null) => {
    const link = getDeepLink(service, saUrl, detail.title, detail.year);
    const { tmdbId } = parseContentItemId(detail.id);
    await openDeepLink(link.url, {
      contentId: tmdbId,
      mediaType: detail.mediaType,
      serviceId: service,
      dwellSecondsBeforeClick: 0,
      linkType: link.type,
    });
  };

  return (
    <View>
      <SectionHead kicker="WHERE TO WATCH" title="On your stack." />

      {tier1.length > 0 ? (
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
        </View>
      ) : null}

      {tier2.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-2 font-sans-bold text-kicker uppercase tracking-[1.6px] text-faint-foreground">
            {tier1.length > 0 ? 'Also available on' : 'Available on'}
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
  onOpen: (service: ServiceId, saUrl: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? options : options.slice(0, 3);

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
              )
            }
            className="flex-row items-center justify-between rounded-card bg-secondary px-3.5 py-3 active:opacity-80">
            <View className="flex-row items-center gap-2.5">
              <ServiceBadge service={option.serviceKey} size="sm" />
              <Text className="font-sans-medium text-body text-foreground">
                {SERVICE_DISPLAY_NAMES[option.serviceKey] ?? option.service}
              </Text>
            </View>
            <Text className="font-sans-medium text-meta text-primary">
              {option.price.startsWith('£')
                ? `${option.type === 'rent' ? 'Rent from' : 'Buy from'} ${option.price}`
                : option.price}
            </Text>
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
