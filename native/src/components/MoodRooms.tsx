import { Image } from 'expo-image';
import { ArrowRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { AnchorRoomPreview } from '@/lib/recommendations-v2/types';
import type { ContentItem } from '@/lib/types/content';
import { SectionHead } from './SectionHead';

// Mood rooms (web CoverStoryMoodRoom + grid). Rooms are prebuilt server-side
// (Worker `anchorRooms`); each carries up to 4 thumbnails + a title count +
// an (async) LLM label. Featured cover-story room then a 2×2 grid, each tinted
// by an atmosphere accent. Tap opens a representative title from the room.

const TINTS = ['#a16ed4', '#3fb6a1', '#e3b04b', '#e16b8c', '#5b8def', '#7fb37b'];

function tintFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function roomLabel(room: AnchorRoomPreview): string {
  return room.llmLabel?.label ?? `If you love ${room.anchorTitle}`;
}

function PosterFan({ thumbnails, size }: { thumbnails: ContentItem[]; size: number }) {
  const three = (thumbnails ?? []).slice(0, 3);
  if (three.length === 0) return null;
  return (
    <View className="flex-row items-center justify-center" style={{ height: size * 1.5 }}>
      {three.map((t, i) => (
        <View
          key={t.id}
          style={{
            width: size,
            marginLeft: i === 0 ? 0 : -size * 0.32,
            zIndex: i === 1 ? 2 : 1,
            transform: [{ rotate: i === 0 ? '-6deg' : i === 1 ? '0deg' : '6deg' }],
          }}>
          <View className="overflow-hidden rounded-md" style={{ borderWidth: 1.5, borderColor: '#13131a' }}>
            <Image
              source={t.image ? { uri: t.image } : undefined}
              style={{ width: size, aspectRatio: 2 / 3 }}
              contentFit="cover"
              recyclingKey={t.id}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function FeaturedRoom({
  room,
  tint,
  onPress,
}: {
  room: AnchorRoomPreview;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-5 mt-3 overflow-hidden rounded-card p-4 active:opacity-90"
      style={{ backgroundColor: withAlpha(tint, 0.14), borderWidth: 0.5, borderColor: withAlpha(tint, 0.35) }}>
      <View className="flex-row items-center gap-2">
        <View style={{ width: 14, height: 1.5, borderRadius: 1, backgroundColor: tint }} />
        <Text className="font-sans-bold text-[10px] uppercase tracking-[1.4px]" style={{ color: tint }}>
          The Featured Room · {room.titleCount} titles
        </Text>
      </View>
      <Text numberOfLines={3} className="mt-1.5 font-display text-title text-foreground">
        {roomLabel(room)}
      </Text>
      <View className="my-3">
        <PosterFan thumbnails={room.thumbnails} size={84} />
      </View>
      {room.llmLabel?.description ? (
        <Text numberOfLines={2} className="font-body-serif text-body text-muted-foreground" style={{ fontStyle: 'italic' }}>
          {room.llmLabel.description}
        </Text>
      ) : null}
      <View
        className="mt-3 flex-row items-center gap-1.5 self-start rounded-pill px-3 py-1.5"
        style={{ backgroundColor: withAlpha(tint, 0.18), borderWidth: 0.5, borderColor: withAlpha(tint, 0.4) }}>
        <Text className="font-sans-bold text-meta uppercase tracking-[0.4px]" style={{ color: tint }}>
          Enter the room
        </Text>
        <ArrowRight size={13} color={tint} />
      </View>
    </Pressable>
  );
}

function GridRoom({
  room,
  tint,
  onPress,
}: {
  room: AnchorRoomPreview;
  tint: string;
  onPress: () => void;
}) {
  return (
    <View className="w-1/2 p-1.5">
      <Pressable
        onPress={onPress}
        className="overflow-hidden rounded-card p-3 active:opacity-90"
        style={{ backgroundColor: withAlpha(tint, 0.16), borderWidth: 0.5, borderColor: withAlpha(tint, 0.3), minHeight: 184 }}>
        <PosterFan thumbnails={room.thumbnails} size={50} />
        <Text className="mt-3 font-sans-bold text-[10px] uppercase tracking-[0.4px]" style={{ color: tint }}>
          Mood Room · {room.titleCount}
        </Text>
        <Text numberOfLines={2} className="mt-1 font-title text-body text-foreground">
          {roomLabel(room)}
        </Text>
      </Pressable>
    </View>
  );
}

export function MoodRooms({
  rooms,
  onItemPress,
}: {
  rooms: AnchorRoomPreview[];
  onItemPress: (item: ContentItem) => void;
}) {
  if (rooms.length === 0) return null;
  const [featured, ...more] = rooms;
  const open = (room: AnchorRoomPreview) => {
    const first = room.thumbnails[0];
    if (first) onItemPress(first);
  };

  return (
    <View>
      <View className="mt-7 px-5">
        <SectionHead kicker="Mood rooms" title="Rooms for the mood you're in." />
      </View>
      <FeaturedRoom room={featured} tint={tintFor(featured.id)} onPress={() => open(featured)} />
      {more.length > 0 ? (
        <View className="mt-1 flex-row flex-wrap px-3.5">
          {more.slice(0, 4).map((room) => (
            <GridRoom key={room.id} room={room} tint={tintFor(room.id)} onPress={() => open(room)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
