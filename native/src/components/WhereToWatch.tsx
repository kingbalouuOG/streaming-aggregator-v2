import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { isServiceId } from '@/components/services/channelCopy';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { ChannelOption, DetailData, RentalOption } from '@/lib/adapters/detailAdapter';
import { serviceIdToProviderId } from '@/lib/adapters/platformAdapter';
import { getDeepLink } from '@/lib/deepLinks';
import { channelTokensFor, registryRowForToken, type ChannelRegistryRow } from '@/lib/entitlements/channels';
import { exitDwell, getCurrentDwellSeconds } from '@/lib/instrumentation/dwellTimer';
import { openDeepLink } from '@/lib/openDeepLink';
import { setUserChannels } from '@/lib/storage/serviceChannels';
import { getUserPreferences, saveUserPreferences } from '@/lib/storage/userPreferences';
import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';
import { classifyProviders } from '@/lib/utils/providerClassifier';
import { ServiceBadge } from './ServiceBadge';
import { SectionHead } from './SectionHead';
import type { ToastState } from './Toast';

// Native Where to Watch — 3-tier availability (design-system §6) with
// live deep linking through the shared resolver + native opener
// (openDeepLink.native → RN Linking → Android ACTION_VIEW). The whole
// reason the core loop matters: "Watch on Netflix" fires the intent.
//
// Add-on channels (IN-SC-004 / IN-SC-006 Direction B): channels the user
// holds join "On your stack"; the rest stay under "Via a channel", with an
// "I have this" pill when the user holds the parent. The pill saves at once
// (a channel, or the service when the channel IS one), moves the row up as
// "just added", and asks the host for a toast with Undo.

interface WhereToWatchProps {
  detail: DetailData;
  userServices?: ServiceId[];
  /** Non-standalone add-on channels the user holds. */
  userChannels?: string[];
  channelRegistry?: ChannelRegistryRow[];
  /** Shows a top toast on the host screen. */
  onToast?: (toast: ToastState) => void;
}

const unique = <T,>(xs: T[]): T[] => [...new Set(xs)];

async function saveServiceList(services: ServiceId[]): Promise<void> {
  const existing = await getUserPreferences();
  await saveUserPreferences(
    {
      region: existing?.region ?? 'GB',
      platforms: services.map((sid) => ({
        id: serviceIdToProviderId(sid),
        name: SERVICE_DISPLAY_NAMES[sid],
        selected: true,
      })),
      homeGenres: existing?.homeGenres,
      selectedClusters: existing?.selectedClusters,
    },
    { strict: true },
  );
}

export function WhereToWatch({ detail, userServices, userChannels, channelRegistry, onToast }: WhereToWatchProps) {
  const qc = useQueryClient();
  const registry = channelRegistry ?? [];

  // Optimistic "I have this" additions, layered on the stored selections
  // until the refetch catches up; `justAdded` holds tokens for the sub-label.
  const [added, setAdded] = useState<{ services: ServiceId[]; channels: string[] }>({ services: [], channels: [] });
  const [justAdded, setJustAdded] = useState<string[]>([]);
  const [savingToken, setSavingToken] = useState<string | null>(null);

  const services = unique([...(userServices ?? []), ...added.services]);
  const channels = unique([...(userChannels ?? []), ...added.channels]);

  const { tier1, tier2, tier3, heldChannels, otherChannels } = classifyProviders(
    detail.allServices,
    detail.rentalOptions,
    services,
    detail.channelOptions ?? [],
    channelTokensFor(registry, services, channels),
  );

  const hasAny =
    tier1.length > 0 ||
    tier2.length > 0 ||
    tier3.length > 0 ||
    heldChannels.length > 0 ||
    otherChannels.length > 0;
  const hasTier1 = tier1.length > 0 || heldChannels.length > 0;

  const refreshFeeds = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['native', 'userServices'] }),
      qc.invalidateQueries({ queryKey: ['native', 'userChannels'] }),
      qc.invalidateQueries({ queryKey: ['native', 'foryou'] }),
      qc.invalidateQueries({ queryKey: ['native', 'home'] }),
    ]);

  const revert = (token: string, service: ServiceId | null, channelId: string) => {
    setAdded((p) => ({
      services: p.services.filter((s) => s !== service),
      channels: p.channels.filter((c) => c !== channelId),
    }));
    setJustAdded((p) => p.filter((t) => t !== token));
  };

  const undo = async (
    token: string,
    service: ServiceId | null,
    channelId: string,
    baseServices: ServiceId[],
    baseChannels: string[],
  ) => {
    revert(token, service, channelId);
    try {
      if (service) await saveServiceList(baseServices);
      else await setUserChannels(baseChannels);
      void refreshFeeds();
    } catch (e) {
      console.error('[WhereToWatch] undo failed:', e);
      onToast?.({ message: "Couldn't undo. Change it in Profile → Streaming Services." });
    }
  };

  const claim = async (option: ChannelOption) => {
    const row = registryRowForToken(registry, option.channelToken);
    const token = option.channelToken;
    if (!row || !token || savingToken) return;
    const service = row.standaloneServiceId && isServiceId(row.standaloneServiceId) ? row.standaloneServiceId : null;
    const baseServices = userServices ?? [];
    const baseChannels = userChannels ?? [];
    const parentName = SERVICE_DISPLAY_NAMES[option.serviceKey] ?? option.serviceKey;

    setSavingToken(token);
    setAdded((p) =>
      service ? { ...p, services: [...p.services, service] } : { ...p, channels: [...p.channels, row.channelId] },
    );
    setJustAdded((p) => [...p, token]);
    try {
      if (service) await saveServiceList(unique([...baseServices, service]));
      else await setUserChannels(unique([...baseChannels, row.channelId]));
      void refreshFeeds();
      onToast?.({
        message: service
          ? `${row.displayName} added to your services. For You will include it.`
          : `${row.displayName} added inside ${parentName}. For You will include it.`,
        onUndo: () => void undo(token, service, row.channelId, baseServices, baseChannels),
      });
    } catch (e) {
      console.error('[WhereToWatch] "I have this" failed:', e);
      revert(token, service, row.channelId);
      onToast?.({ message: `Couldn't add ${row.displayName}. Check your connection and try again.` });
    } finally {
      setSavingToken(null);
    }
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

  const channelName = (option: ChannelOption) =>
    registryRowForToken(registry, option.channelToken)?.displayName ?? option.channelName;

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
            const just = option.channelToken ? justAdded.includes(option.channelToken) : false;
            return (
              <Pressable
                key={option.channelToken ?? `${option.serviceKey}-${option.channelName}`}
                onPress={() => open(option.serviceKey, option.deepLinkUrl ?? null)}
                className="flex-row items-center gap-3 rounded-card border border-primary-edge bg-primary-soft px-4 py-3 active:opacity-80">
                <ServiceBadge service={option.serviceKey} size="md" />
                <View className="flex-1">
                  <Text className="font-sans-bold text-body text-foreground">Watch on {channelName(option)}</Text>
                  <Text className="font-sans text-meta text-muted-foreground">
                    via {SERVICE_DISPLAY_NAMES[option.serviceKey] ?? option.serviceKey} ·{' '}
                    {just ? 'just added' : 'a channel you hold'}
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

      {otherChannels.length > 0 ? (
        <ChannelList
          options={otherChannels}
          nameOf={channelName}
          canClaim={(option) =>
            services.includes(option.serviceKey) && registryRowForToken(registry, option.channelToken) !== null
          }
          saving={savingToken !== null}
          onClaim={(option) => void claim(option)}
          onOpen={open}
        />
      ) : null}
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
  nameOf,
  canClaim,
  saving,
  onClaim,
  onOpen,
}: {
  options: ChannelOption[];
  nameOf: (option: ChannelOption) => string;
  canClaim: (option: ChannelOption) => boolean;
  saving: boolean;
  onClaim: (option: ChannelOption) => void;
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
            key={option.channelToken ?? `${option.serviceKey}-${option.channelName}`}
            onPress={() => onOpen(option.serviceKey, option.deepLinkUrl ?? null, null)}
            className="flex-row items-center gap-2.5 rounded-card bg-secondary px-3.5 py-3 active:opacity-80">
            <ServiceBadge service={option.serviceKey} size="sm" />
            <View className="flex-1">
              <Text className="font-sans-medium text-body text-foreground">{nameOf(option)}</Text>
              <Text className="font-sans text-meta text-muted-foreground">
                on {SERVICE_DISPLAY_NAMES[option.serviceKey] ?? option.serviceKey}
              </Text>
            </View>
            {canClaim(option) ? (
              <Pressable
                onPress={() => onClaim(option)}
                disabled={saving}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`I have ${nameOf(option)}`}
                className="min-h-[32px] justify-center rounded-pill border border-primary-edge px-3 active:opacity-70">
                <Text className="font-sans-bold text-[12px] text-primary">I have this</Text>
              </Pressable>
            ) : null}
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
