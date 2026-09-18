import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Bookmark, ChevronDown, ChevronRight, LayoutGrid, List as ListIcon, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SharedListView } from '@/components/household/SharedListView';
import { PosterGridCard } from '@/components/PosterGridCard';
import { WatchlistListRow } from '@/components/WatchlistListRow';
import { useHousehold } from '@/hooks/useHousehold';
import { useWatchlist, watchlistItemToContentItem } from '@/hooks/useWatchlist';
import { countLabel } from '@/lib/format/plural';
import type { Household } from '@/lib/household/households';
import type { ContentItem } from '@/lib/types/content';
import { useAuth } from '@/providers/auth';

type Tab = 'want_to_watch' | 'watched';
type View2 = 'grid' | 'list';
type WlSort = 'recent' | 'a_z' | 'rating';
const SORT_LABELS: Record<WlSort, string> = { recent: 'Recent', a_z: 'A–Z', rating: 'Rating' };
const SORTS: WlSort[] = ['recent', 'a_z', 'rating'];

export default function WatchlistScreen() {
  const router = useRouter();
  const { data: items, isLoading } = useWatchlist();
  const [tab, setTab] = useState<Tab>('want_to_watch');
  const [view, setView] = useState<View2>('grid');
  const [sort, setSort] = useState<WlSort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  // Growth G2: which list the tab shows, "Mine" (the personal list, as it
  // always was) or a household's shared list, by household id.
  const { session } = useAuth();
  const { data: households } = useHousehold();
  const [listSel, setListSel] = useState<string>('mine');
  const shared = households?.find((h) => h.id === listSel) ?? null;

  const wantCount = (items ?? []).filter((i) => i.status === 'want_to_watch').length;
  const watchedCount = (items ?? []).filter((i) => i.status === 'watched').length;

  const visible = useMemo(() => {
    const mapped = (items ?? []).filter((i) => i.status === tab).map(watchlistItemToContentItem);
    if (sort === 'a_z') return [...mapped].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'rating') return [...mapped].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return mapped; // recent = storage order
  }, [items, tab, sort]);

  const openDetail = (item: ContentItem) =>
    router.push({
      pathname: '/detail/[id]',
      params: { id: item.id, title: item.title, image: item.image },
    });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="px-5 pt-2">
        <View className="flex-row items-center justify-between">
          <Text className="font-display-black text-headline text-foreground">Watchlist</Text>
          {shared ? null : (
            <View className="flex-row items-center gap-2">
              <View>
                <Pressable
                  onPress={() => setSortOpen((v) => !v)}
                  className="flex-row items-center gap-1 rounded-pill border border-border bg-card px-3 py-1.5 active:bg-secondary">
                  <Text className="font-sans-medium text-meta text-muted-foreground">{SORT_LABELS[sort]}</Text>
                  <ChevronDown size={13} color="rgba(245,241,232,0.62)" />
                </Pressable>
                {sortOpen ? (
                  <View className="absolute right-0 top-9 z-10 w-32 rounded-card border border-border bg-card py-1" style={{ elevation: 8 }}>
                    {SORTS.map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => {
                          setSort(s);
                          setSortOpen(false);
                        }}
                        className="px-3 py-2 active:bg-secondary">
                        <Text className={s === sort ? 'font-sans-bold text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
                          {SORT_LABELS[s]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <View className="flex-row gap-1 rounded-pill border border-border bg-card p-1">
                <Pressable onPress={() => setView('grid')} className={view === 'grid' ? 'rounded-pill bg-primary-soft px-2 py-1' : 'px-2 py-1'}>
                  <LayoutGrid size={15} color={view === 'grid' ? '#e85d25' : 'rgba(245,241,232,0.55)'} />
                </Pressable>
                <Pressable onPress={() => setView('list')} className={view === 'list' ? 'rounded-pill bg-primary-soft px-2 py-1' : 'px-2 py-1'}>
                  <ListIcon size={15} color={view === 'list' ? '#e85d25' : 'rgba(245,241,232,0.55)'} />
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {session ? (
          <ListPicker
            households={households ?? []}
            selected={shared ? shared.id : 'mine'}
            onSelect={setListSel}
            onCreate={() => router.push({ pathname: '/profile/[section]', params: { section: 'household' } })}
          />
        ) : null}

        {shared ? null : (
          <View className="mt-4 flex-row gap-2">
            <SegmentButton label={`Want to watch · ${wantCount}`} active={tab === 'want_to_watch'} onPress={() => setTab('want_to_watch')} />
            <SegmentButton label={`Watched · ${watchedCount}`} active={tab === 'watched'} onPress={() => setTab('watched')} />
          </View>
        )}
      </View>

      {shared ? (
        <SharedListView household={shared} header={<SharedHeader household={shared} />} />
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e85d25" />
        </View>
      ) : visible.length === 0 ? (
        <EmptyState tab={tab} />
      ) : view === 'grid' ? (
        <FlashList
          data={visible}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PosterGridCard item={item} onPress={openDetail} />}
          contentContainerStyle={{ padding: 14 }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlashList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <WatchlistListRow item={item} onPress={openDetail} />}
          contentContainerStyle={{ paddingVertical: 8 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// "Mine" plus one chip per household. No household: one quiet row that
// leads to creating one (Profile → Household).
function ListPicker({
  households,
  selected,
  onSelect,
  onCreate,
}: {
  households: Household[];
  selected: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  if (households.length === 0) {
    return (
      <Pressable onPress={onCreate} className="mt-3 flex-row items-center gap-2 py-1 active:opacity-70">
        <Users size={15} color="rgba(245,241,232,0.62)" />
        <Text className="flex-1 font-sans text-meta text-muted-foreground">
          Watch together. Create a household and share one list.
        </Text>
        <ChevronRight size={15} color="rgba(245,241,232,0.4)" />
      </Pressable>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="gap-2">
      <PickerChip label="Mine" active={selected === 'mine'} onPress={() => onSelect('mine')} />
      {households.map((h) => (
        <PickerChip key={h.id} label={h.name} active={selected === h.id} onPress={() => onSelect(h.id)} />
      ))}
    </ScrollView>
  );
}

function PickerChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={active ? 'rounded-pill bg-foreground px-3.5 py-1.5' : 'rounded-pill px-3.5 py-1.5 active:bg-secondary'}>
      <Text
        numberOfLines={1}
        className={active ? 'font-sans-bold text-meta text-background' : 'font-sans-medium text-meta text-muted-foreground'}>
        {label}
      </Text>
    </Pressable>
  );
}

function SharedHeader({ household }: { household: Household }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() =>
        household.watchlistId
          ? router.push({ pathname: '/list/[id]', params: { id: household.watchlistId } })
          : undefined
      }
      className="mx-5 mt-3 flex-row items-center gap-2 rounded-card border border-border bg-card px-4 py-3 active:bg-secondary">
      <Users size={16} color="rgba(245,241,232,0.62)" />
      <Text className="flex-1 font-sans text-meta text-muted-foreground">
        {countLabel(household.memberCount, 'member')} · {household.isOwner ? 'Open to invite' : 'Open to share'}
      </Text>
      <ChevronRight size={16} color="rgba(245,241,232,0.4)" />
    </Pressable>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={
        active
          ? 'rounded-pill border border-primary-edge bg-primary-soft px-4 py-2'
          : 'rounded-pill border border-border bg-card px-4 py-2 active:bg-secondary'
      }>
      <Text className={active ? 'font-sans-bold text-body text-primary' : 'font-sans-medium text-body text-muted-foreground'}>
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-card">
        <Bookmark size={28} color="rgba(245,241,232,0.4)" />
      </View>
      <Text className="mt-4 text-center font-standfirst text-section text-foreground">
        {tab === 'want_to_watch' ? 'Nothing saved yet' : 'Nothing watched yet'}
      </Text>
      <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
        {tab === 'want_to_watch'
          ? 'Tap the bookmark on any title to save it here.'
          : 'Mark titles as watched from their detail page.'}
      </Text>
    </View>
  );
}
