import { Check } from 'lucide-react-native';
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ServiceBadge } from '@/components/ServiceBadge';
import { SERVICE_CATALOG } from '@/constants/serviceCatalog';
import { useChannelRegistry } from '@/hooks/useChannels';
import { channelChoicesFor, type ChannelChoice } from '@/lib/entitlements/channels';
import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';

// Service tiles + add-on channel chips (IN-SC-004), shared by onboarding
// Step 2 and Profile → Streaming Services so the two stay identical.
//
// A selected Prime / Apple / NOW tile opens a row of chips beneath its row
// of tiles (chips, not a modal — the parent stays the anchor). One chip per
// curated channel. A chip for a channel that is also a standalone service
// (HBO Max, Paramount+ …) IS that service's selection: it toggles the same
// id as the tile, so there is never a duplicate entitlement.

interface ServicePickerProps {
  services: ServiceId[];
  channels: string[];
  onToggleService: (id: ServiceId) => void;
  onToggleChannel: (channelId: string) => void;
}

const ROWS: (typeof SERVICE_CATALOG)[] = [];
for (let i = 0; i < SERVICE_CATALOG.length; i += 2) ROWS.push(SERVICE_CATALOG.slice(i, i + 2));

function isServiceId(id: string): id is ServiceId {
  return id in SERVICE_DISPLAY_NAMES;
}

export function ServicePicker({ services, channels, onToggleService, onToggleChannel }: ServicePickerProps) {
  const { data: registry } = useChannelRegistry();
  const selected = new Set(services);
  const held = new Set(channels);

  const isOn = (choice: ChannelChoice) =>
    choice.standaloneServiceId && isServiceId(choice.standaloneServiceId)
      ? selected.has(choice.standaloneServiceId)
      : held.has(choice.channelId);

  const toggle = (choice: ChannelChoice) =>
    choice.standaloneServiceId && isServiceId(choice.standaloneServiceId)
      ? onToggleService(choice.standaloneServiceId)
      : onToggleChannel(choice.channelId);

  return (
    <View className="mt-4">
      {ROWS.map((row) => (
        <Fragment key={row.map((s) => s.id).join('-')}>
          <View className="flex-row">
            {row.map((svc) => (
              <ServiceTile
                key={svc.id}
                id={svc.id}
                name={svc.name}
                description={svc.description}
                selected={selected.has(svc.id)}
                onPress={() => onToggleService(svc.id)}
              />
            ))}
          </View>
          {row
            .filter((svc) => selected.has(svc.id))
            .map((svc) => {
              const choices = registry ? channelChoicesFor(registry, svc.id) : [];
              if (choices.length === 0) return null;
              return (
                <View key={`${svc.id}-channels`} className="px-1.5 pb-1.5">
                  <View className="rounded-card border border-border bg-card px-3 py-3">
                    <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-faint-foreground">
                      Channels through {svc.name}
                    </Text>
                    <View className="mt-2 flex-row flex-wrap gap-2">
                      {choices.map((choice) => {
                        const on = isOn(choice);
                        return (
                          <Pressable
                            key={choice.channelId}
                            onPress={() => toggle(choice)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            className={
                              on
                                ? 'flex-row items-center gap-1.5 rounded-pill border border-primary-edge bg-primary-soft px-3 py-1.5'
                                : 'flex-row items-center gap-1.5 rounded-pill border border-border bg-secondary px-3 py-1.5 active:opacity-80'
                            }>
                            {on ? <Check size={12} color="#e85d25" strokeWidth={3} /> : null}
                            <Text
                              className={
                                on
                                  ? 'font-sans-bold text-meta text-foreground'
                                  : 'font-sans-medium text-meta text-muted-foreground'
                              }>
                              {choice.displayName}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              );
            })}
        </Fragment>
      ))}
    </View>
  );
}

function ServiceTile({
  id,
  name,
  description,
  selected,
  onPress,
}: {
  id: ServiceId;
  name: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <View className="w-1/2 p-1.5">
      <Pressable
        onPress={onPress}
        className={
          selected
            ? 'flex-row items-center gap-2.5 rounded-card border border-primary bg-primary-soft p-3'
            : 'flex-row items-center gap-2.5 rounded-card border border-border bg-card p-3 active:bg-secondary'
        }>
        <ServiceBadge service={id} size="lg" />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-sans-bold text-meta text-foreground">
            {name}
          </Text>
          <Text numberOfLines={1} className="font-sans text-[11px] text-muted-foreground">
            {description}
          </Text>
        </View>
        {selected ? (
          <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
            <Check size={12} color="#ffffff" strokeWidth={3} />
          </View>
        ) : (
          <View className="h-5 w-5 rounded-full border-2 border-border" />
        )}
      </Pressable>
    </View>
  );
}
