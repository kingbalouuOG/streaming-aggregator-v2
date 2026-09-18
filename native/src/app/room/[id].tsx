import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { PosterGridCard } from '@/components/PosterGridCard';
import { ShareButton } from '@/components/ShareButton';
import { useSharedRoom } from '@/hooks/useSharedRoom';
import { countLabel } from '@/lib/format/plural';
import { formatPickedDate, sharedRoomUrl } from '@/lib/growth/roomSnapshot';
import type { ContentItem } from '@/lib/types/content';
import { useClearPendingLinkOnFocus } from '@/pendingLink';
import { useAuth } from '@/providers/auth';
import { SharedRoomNotFoundError } from '@/sharedRoomApi';

// Shared room snapshot (Growth G0-4, ADR-015). Opened from
// https://videxstreaming.com/room/{id} (universal / app link) or
// videx://room/{id}. Renders the frozen titles in the sharer's order with
// the normal poster cards and their availability chips. No extras by
// decision (plan §9b): no "add all", no live-room link.

export default function RoomRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { data, isLoading, isError, error, refetch } = useSharedRoom(id);

  // Shown to a signed-in user: the pending link has done its job (on focus,
  // IN-GR-040; see native/src/pendingLink.ts).
  useClearPendingLinkOnFocus(`/room/${id}`, !!session && !!id);

  const top = insets.top + 12;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const openDetail = (item: ContentItem) =>
    router.push({
      pathname: '/detail/[id]',
      params: { id: item.id, title: item.title, image: item.image },
    });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#e85d25" />
        <BackButton onPress={back} top={top} />
      </View>
    );
  }

  if (isError || !data) {
    const missing = error instanceof SharedRoomNotFoundError;
    return (
      <View className="flex-1 bg-background">
        <BackButton onPress={back} top={top} />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center font-standfirst text-section text-foreground">
            {missing ? "This room isn't available" : "Couldn't load this room"}
          </Text>
          <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
            {missing ? 'The link may be mistyped.' : 'Check your connection and try again.'}
          </Text>
          {missing ? null : (
            <Pressable onPress={() => refetch()} className="mt-4">
              <Text className="font-sans-bold text-body text-primary">Try again</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const picked = formatPickedDate(data.createdAt);
  const count = data.items.length;

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={data.items}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PosterGridCard item={item} onPress={openDetail} />}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View className="px-1.5 pb-3" style={{ paddingTop: top + 52 }}>
            <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
              Mood room
            </Text>
            <Text className="mt-1 font-display text-headline text-foreground">{data.label}</Text>
            <Text className="mt-1.5 font-sans text-body text-muted-foreground">
              {countLabel(count, 'title')}
              {picked ? ` · picked on ${picked}` : ''}
            </Text>
            {data.description ? (
              <Text
                className="mt-2 font-body-serif text-body text-muted-foreground"
                style={{ fontStyle: 'italic' }}>
                {data.description}
              </Text>
            ) : null}
          </View>
        }
      />
      <BackButton onPress={back} top={top} />
      <ShareButton top={top} url={sharedRoomUrl(data.id)} label={data.label} count={count} surface="room" />
    </View>
  );
}
