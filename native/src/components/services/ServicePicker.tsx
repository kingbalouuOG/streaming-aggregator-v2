import { Check, ChevronRight } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ServiceBadge } from '@/components/ServiceBadge';
import { SERVICE_CATALOG } from '@/constants/serviceCatalog';
import { useChannelRegistry } from '@/hooks/useChannels';
import { channelChoicesFor, type ChannelChoice } from '@/lib/entitlements/channels';
import type { ServiceId } from '@/lib/types/content';
import { ChannelSheet } from './ChannelSheet';
import { channelWord, isServiceId } from './channelCopy';

// Service tiles + add-on channels (IN-SC-004 model, IN-SC-006 Direction B),
// shared by onboarding step 2 and Profile → Streaming Services.
//
// The grid is unchanged; a selected Prime Video / Apple TV+ / NOW tile gains
// a footer strip INSIDE the tile ("Any channels inside?" / "Shudder, MGM+"),
// so it can only belong to that tile. Nothing opens on its own: tapping the
// strip opens that parent's channel sheet. A channel that is also a
// standalone service (HBO Max, Paramount+ …) IS that service's selection —
// its sheet row toggles the same id as the tile.

interface ServicePickerProps {
  services: ServiceId[];
  channels: string[];
  onToggleService: (id: ServiceId) => void;
  onToggleChannel: (channelId: string) => void;
}

// Parents that sell channels. Used only to show the failed-load strip when
// the registry itself could not be read; otherwise the registry decides.
const CHANNEL_PARENTS: ReadonlySet<ServiceId> = new Set<ServiceId>(['prime', 'apple', 'now']);

const ROWS: (typeof SERVICE_CATALOG)[] = [];
for (let i = 0; i < SERVICE_CATALOG.length; i += 2) ROWS.push(SERVICE_CATALOG.slice(i, i + 2));

const NAME_BY_ID = new Map(SERVICE_CATALOG.map((s) => [s.id, s.name]));

export function ServicePicker({ services, channels, onToggleService, onToggleChannel }: ServicePickerProps) {
  const registry = useChannelRegistry();
  // Kept after close so the sheet can animate out with its content.
  const [sheet, setSheet] = useState<{ parent: ServiceId; open: boolean } | null>(null);

  const selected = new Set(services);
  const held = new Set(channels);
  const failed = registry.isError && !registry.data;

  const choicesFor = (parent: ServiceId) => (registry.data ? channelChoicesFor(registry.data, parent) : []);

  const isOn = (choice: ChannelChoice) =>
    choice.standaloneServiceId && isServiceId(choice.standaloneServiceId)
      ? selected.has(choice.standaloneServiceId)
      : held.has(choice.channelId);

  const toggle = (choice: ChannelChoice) =>
    choice.standaloneServiceId && isServiceId(choice.standaloneServiceId)
      ? onToggleService(choice.standaloneServiceId)
      : onToggleChannel(choice.channelId);

  return (
    <View className="mt-4 gap-2.5">
      {ROWS.map((row) => (
        <View key={row.map((s) => s.id).join('-')} className="flex-row items-start gap-2.5">
          {row.map((svc) => {
            const isSel = selected.has(svc.id);
            const choices = choicesFor(svc.id);
            const showStrip = isSel && (choices.length > 0 || (failed && CHANNEL_PARENTS.has(svc.id)));
            return (
              <ServiceTile
                key={svc.id}
                id={svc.id}
                name={svc.name}
                description={svc.description}
                selected={isSel}
                onPress={() => onToggleService(svc.id)}
                strip={
                  showStrip ? (
                    <ChannelStrip
                      parent={svc.id}
                      parentName={svc.name}
                      heldNames={choices.filter(isOn).map((c) => c.displayName)}
                      failed={failed}
                      onPress={() => (failed ? void registry.refetch() : setSheet({ parent: svc.id, open: true }))}
                    />
                  ) : null
                }
              />
            );
          })}
          {row.length === 1 ? <View className="flex-1" /> : null}
        </View>
      ))}

      {sheet ? (
        <ChannelSheet
          open={sheet.open}
          parent={sheet.parent}
          parentName={NAME_BY_ID.get(sheet.parent) ?? sheet.parent}
          choices={choicesFor(sheet.parent)}
          failed={failed}
          isOn={isOn}
          onToggle={toggle}
          onRetry={() => void registry.refetch()}
          onClose={() => setSheet((s) => (s ? { ...s, open: false } : s))}
        />
      ) : null}
    </View>
  );
}

function ServiceTile({
  id,
  name,
  description,
  selected,
  onPress,
  strip,
}: {
  id: ServiceId;
  name: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  strip: ReactNode;
}) {
  return (
    <View
      className={
        selected
          ? 'flex-1 overflow-hidden rounded-card border border-primary bg-primary-soft'
          : 'flex-1 overflow-hidden rounded-card border border-border bg-card'
      }>
      <Pressable
        onPress={onPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={name}
        className="flex-row items-center gap-2.5 p-3 active:opacity-80">
        <ServiceBadge service={id} size="tile" />
        <View className="flex-1">
          <Text numberOfLines={2} className="font-sans-bold text-[13px] leading-4 text-foreground">
            {name}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 font-sans text-[11px] text-muted-foreground">
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
      {strip}
    </View>
  );
}

function ChannelStrip({
  parent,
  parentName,
  heldNames,
  failed,
  onPress,
}: {
  parent: ServiceId;
  parentName: string;
  heldNames: string[];
  failed: boolean;
  onPress: () => void;
}) {
  const n = heldNames.length;
  const plural = channelWord(parent, 2);
  const summary = failed ? `${plural[0].toUpperCase()}${plural.slice(1)} unavailable` : n > 0 ? heldNames.join(', ') : `Any ${plural} inside?`;
  const label = failed ? `${parentName} ${plural} unavailable, retry` : `${parentName} ${plural}, ${n} held`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-[44px] flex-row items-center gap-2 px-3 active:opacity-80"
      style={{ borderTopWidth: 1, borderTopColor: 'rgba(232,93,37,0.42)', backgroundColor: 'rgba(10,10,15,0.35)' }}>
      <Text
        numberOfLines={1}
        className={
          failed
            ? 'flex-1 font-sans-bold text-[12px] text-faint-foreground'
            : 'flex-1 font-sans-bold text-[12px] text-foreground'
        }>
        {summary}
      </Text>
      {failed ? (
        <Text className="font-sans-bold text-[11px] text-primary">Retry</Text>
      ) : n > 0 ? (
        <>
          <Text className="font-sans-bold text-[11px] text-muted-foreground">
            {n} {channelWord(parent, n)}
          </Text>
          <ChevronRight size={12} color="rgba(245,241,232,0.62)" />
        </>
      ) : (
        <>
          <Text className="font-sans-bold text-[11px] text-primary">Choose</Text>
          <ChevronRight size={12} color="#e85d25" />
        </>
      )}
    </Pressable>
  );
}
