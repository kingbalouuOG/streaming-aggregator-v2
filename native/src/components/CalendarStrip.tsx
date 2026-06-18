import { Image } from 'expo-image';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useItemServices } from '@/hooks/useItemServices';
import type { UpcomingItem } from '@/hooks/useHomeFeed';
import type { ContentItem } from '@/lib/types/content';
import { SectionHead } from './SectionHead';
import { ServiceBadge } from './ServiceBadge';

// "On the calendar" — upcoming releases grouped under full-width date headers
// (web CalendarList). Date is a group label above its items, not a cramped
// pill, so "Wed 12 Jun" etc. never truncates.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// Row extracted so useItemServices runs once per row (hooks can't be called
// inside the .map). Badges resolve lazily for TMDb cards (services: []).
function CalendarRow({
  item,
  onItemPress,
}: {
  item: ContentItem;
  onItemPress: (item: ContentItem) => void;
}) {
  const services = useItemServices(item);
  return (
    <Pressable
      onPress={() => onItemPress(item)}
      className="flex-row items-center gap-3 py-2 active:opacity-70">
      <View className="overflow-hidden rounded-md bg-card" style={{ width: 44 }}>
        <Image
          source={item.image ? { uri: item.image } : undefined}
          style={{ width: 44, aspectRatio: 2 / 3 }}
          contentFit="cover"
          transition={150}
          recyclingKey={item.id}
        />
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="font-title text-section text-foreground">
          {item.title}
        </Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          {services[0] ? <ServiceBadge service={services[0]} size="xs" /> : null}
          <Text
            numberOfLines={1}
            className="flex-1 font-sans-medium text-[11px] uppercase tracking-[0.3px] text-faint-foreground">
            {item.genre ?? (item.type === 'tv' ? 'TV' : 'Film')}
          </Text>
        </View>
      </View>
      <ChevronRight size={16} color="rgba(245,241,232,0.4)" />
    </Pressable>
  );
}

export function CalendarStrip({
  items,
  onItemPress,
}: {
  items: UpcomingItem[];
  onItemPress: (item: ContentItem) => void;
}) {
  const shown = items.slice(0, 8);
  if (shown.length === 0) return null;

  // Group consecutive same-date items (items arrive sorted by date).
  const groups: { label: string; items: UpcomingItem[] }[] = [];
  for (const u of shown) {
    const label = dateLabel(u.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(u);
    else groups.push({ label, items: [u] });
  }

  return (
    <View className="mt-7 px-5">
      <SectionHead kicker="The Calendar" title="On the calendar." />
      <View className="mt-1">
        {groups.map((g) => (
          <View key={g.label}>
            <Text className="mb-1 mt-2.5 font-sans-bold text-[10px] uppercase tracking-[1.2px] text-primary">
              {g.label}
            </Text>
            {g.items.map((u) => (
              <CalendarRow key={u.item.id} item={u.item} onItemPress={onItemPress} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
