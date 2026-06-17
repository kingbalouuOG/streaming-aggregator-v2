import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ChevronDown, Search, Sparkles, SlidersHorizontal, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrowsePresearch, type Mood } from '@/components/BrowsePresearch';
import {
  applyBrowseFilters,
  countActiveFilters,
  DEFAULT_FILTERS,
  SORT_LABELS,
  sortItems,
  type BrowseFilters,
  type SortMode,
} from '@/components/browseFilters';
import { FilterSheet } from '@/components/FilterSheet';
import { PosterGridCard } from '@/components/PosterGridCard';
import { useBrowseDiscover } from '@/hooks/useBrowseDiscover';
import { useSearch, type SearchCategory } from '@/hooks/useSearch';
import { useSemanticFlag, useSemanticSearch } from '@/hooks/useSemanticSearch';
import { useUserServices } from '@/hooks/useUserServices';
import { useWatchlist } from '@/hooks/useWatchlist';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { ContentItem } from '@/lib/types/content';

const CATEGORIES: SearchCategory[] = ['All', 'Movies', 'TV', 'Docs'];
const SORT_MODES: SortMode[] = ['best', 'popularity', 'rating', 'a_z', 'z_a'];

export default function BrowseScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<SearchCategory>('All');
  const [filters, setFilters] = useState<BrowseFilters>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('best');
  const [sortOpen, setSortOpen] = useState(false);
  // Active mood when semantic search is on — { label, phrase }, else null.
  const [mood, setMood] = useState<{ label: string; phrase: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isFetching } = useSearch(debounced, category);
  const { data: watchlist } = useWatchlist();
  const { data: userServices } = useUserServices();
  const { data: semanticOn } = useSemanticFlag();

  const searching = debounced.trim().length >= 2;
  const activeCount = countActiveFilters(filters);
  // Semantic mood mode — a mood is active and the user isn't typing. Only
  // ever set when the `search_semantic` flag is on (see handleMood).
  const semanticMode = !!mood && !searching;
  const semantic = useSemanticSearch(mood?.phrase ?? null, semanticMode);
  // Filter-only browse — filters applied without a text query or a mood.
  const filterOnlyMode = !searching && !semanticMode && activeCount > 0;
  const presearch = !searching && !semanticMode && activeCount === 0;
  const showControls = searching || filterOnlyMode;

  const browse = useBrowseDiscover(filters, sortMode, filterOnlyMode, userServices ?? []);

  const watchedIds = useMemo(() => {
    const set = new Set<string>();
    for (const w of watchlist ?? []) if (w.status === 'watched') set.add(`${w.type}-${w.id}`);
    return set;
  }, [watchlist]);

  const isWatched = useCallback(
    (id: string) => {
      const { tmdbId, mediaType } = parseContentItemId(id);
      return watchedIds.has(`${mediaType}-${tmdbId}`);
    },
    [watchedIds],
  );

  // Mood tap: semantic (vector) search when the flag is on, deterministic
  // filter preset as the fallback when it's off. The two intents are mutually
  // exclusive with typed search, so each clears the other.
  const handleMood = useCallback(
    (m: Mood) => {
      if (semanticOn) {
        setQuery('');
        setDebounced('');
        setFilters(DEFAULT_FILTERS);
        setMood({ label: m.label, phrase: m.phrase });
      } else {
        setMood(null);
        setFilters(m.preset);
      }
    },
    [semanticOn],
  );

  const shown = useMemo(() => {
    if (semanticMode) return semantic.data ?? [];
    if (searching) {
      if (!results) return [];
      return sortItems(applyBrowseFilters(results, filters, isWatched), sortMode);
    }
    if (filterOnlyMode) {
      // /discover already applied service/genre/rating/runtime/type. Only the
      // watched filter is client-side (it needs the local watchlist).
      const base = browse.data ?? [];
      const watchApplied =
        filters.showWatched === 'all'
          ? base
          : base.filter((it) => (filters.showWatched === 'hide' ? !isWatched(it.id) : isWatched(it.id)));
      return sortItems(watchApplied, sortMode);
    }
    return [];
  }, [semanticMode, semantic.data, searching, filterOnlyMode, results, browse.data, filters, sortMode, isWatched]);

  const loading = semanticMode
    ? semantic.isFetching && !semantic.data
    : searching
      ? isFetching && !results
      : filterOnlyMode && browse.isFetching && !browse.data;

  const openDetail = (item: ContentItem) =>
    router.push({
      pathname: '/detail/[id]',
      params: { id: item.id, title: item.title, image: item.image },
    });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="px-5 pt-2">
        <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3">
          <Search size={18} color="rgba(245,241,232,0.62)" />
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              if (t.length > 0) setMood(null);
            }}
            placeholder="Search films & shows"
            placeholderTextColor="rgba(245,241,232,0.4)"
            autoCapitalize="none"
            returnKeyType="search"
            className="flex-1 font-sans text-body text-foreground"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={18} color="rgba(245,241,232,0.62)" />
            </Pressable>
          ) : null}
        </View>

        {searching ? (
          <View className="mt-3 flex-row gap-2">
            {CATEGORIES.map((cat) => {
              const active = cat === category;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  className={
                    active
                      ? 'rounded-pill border border-primary-edge bg-primary-soft px-3.5 py-1.5'
                      : 'rounded-pill border border-border bg-card px-3.5 py-1.5 active:bg-secondary'
                  }>
                  <Text className={active ? 'font-sans-bold text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Semantic mood banner — italic "feels like" + Clear */}
        {semanticMode ? (
          <View className="mt-3 flex-row items-center justify-between gap-3">
            <View className="flex-1 flex-row items-center gap-2">
              <Sparkles size={14} color="#e85d25" />
              <Text numberOfLines={1} className="flex-1 font-body-serif italic text-body text-foreground">
                Titles that feel like “{mood?.label}”
              </Text>
            </View>
            <Pressable
              onPress={() => setMood(null)}
              hitSlop={8}
              className="flex-row items-center gap-1 rounded-pill px-2 py-1.5 active:opacity-70">
              <X size={12} color="rgba(245,241,232,0.5)" />
              <Text className="font-sans-medium text-meta text-faint-foreground">Clear</Text>
            </Pressable>
          </View>
        ) : null}

        {showControls ? (
          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => setSheetOpen(true)}
                className={
                  activeCount > 0
                    ? 'flex-row items-center gap-1.5 rounded-pill border border-primary-edge bg-primary-soft px-3 py-1.5'
                    : 'flex-row items-center gap-1.5 rounded-pill border border-border bg-card px-3 py-1.5 active:bg-secondary'
                }>
                <SlidersHorizontal size={14} color={activeCount > 0 ? '#e85d25' : 'rgba(245,241,232,0.62)'} />
                <Text className={activeCount > 0 ? 'font-sans-bold text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
                  {activeCount > 0 ? `Filters · ${activeCount}` : 'Filters'}
                </Text>
              </Pressable>
              {activeCount > 0 ? (
                <Pressable
                  onPress={() => setFilters(DEFAULT_FILTERS)}
                  hitSlop={6}
                  className="flex-row items-center gap-1 rounded-pill px-2 py-1.5 active:opacity-70">
                  <X size={12} color="rgba(245,241,232,0.5)" />
                  <Text className="font-sans-medium text-meta text-faint-foreground">Clear</Text>
                </Pressable>
              ) : null}
            </View>

            <View>
              <Pressable
                onPress={() => setSortOpen((v) => !v)}
                className="flex-row items-center gap-1 rounded-pill border border-border bg-card px-3 py-1.5 active:bg-secondary">
                <Text className="font-sans-medium text-meta text-muted-foreground">{SORT_LABELS[sortMode]}</Text>
                <ChevronDown size={13} color="rgba(245,241,232,0.62)" />
              </Pressable>
              {sortOpen ? (
                <View
                  className="absolute right-0 top-9 z-10 w-36 rounded-card border border-border bg-card py-1"
                  style={{ elevation: 8 }}>
                  {SORT_MODES.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setSortMode(m);
                        setSortOpen(false);
                      }}
                      className="px-3 py-2 active:bg-secondary">
                      <Text className={m === sortMode ? 'font-sans-bold text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
                        {SORT_LABELS[m]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {presearch ? (
        <BrowsePresearch onBuild={() => setSheetOpen(true)} onMood={handleMood} />
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e85d25" />
        </View>
      ) : shown.length > 0 ? (
        <FlashList
          data={shown}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PosterGridCard item={item} onPress={openDetail} />}
          contentContainerStyle={{ padding: 14 }}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <NoResults
          query={debounced}
          filterOnly={filterOnlyMode}
          semantic={semanticMode}
          moodLabel={mood?.label}
          tightened={activeCount > 0 && searching && (results?.length ?? 0) > 0}
        />
      )}

      <FilterSheet visible={sheetOpen} filters={filters} onApply={setFilters} onClose={() => setSheetOpen(false)} />
    </SafeAreaView>
  );
}

function NoResults({
  query,
  filterOnly,
  semantic,
  moodLabel,
  tightened,
}: {
  query: string;
  filterOnly: boolean;
  semantic: boolean;
  moodLabel?: string;
  tightened: boolean;
}) {
  if (semantic) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="text-center font-standfirst text-section text-foreground">Nothing in that mood</Text>
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          We couldn’t find titles that feel like “{moodLabel}” right now. Try another feeling.
        </Text>
      </View>
    );
  }
  const title = filterOnly || tightened ? 'Nothing matches' : 'No matches';
  const body =
    filterOnly || tightened
      ? 'Nothing matches this filter combination. Try loosening the filters.'
      : `Nothing found for “${query.trim()}”. Try a different title.`;
  return (
    <View className="flex-1 items-center justify-center px-10">
      <Text className="text-center font-standfirst text-section text-foreground">{title}</Text>
      <Text className="mt-2 text-center font-sans text-body text-muted-foreground">{body}</Text>
    </View>
  );
}
