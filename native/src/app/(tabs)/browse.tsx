import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PosterGridCard } from '@/components/PosterGridCard';
import { useSearch, type SearchCategory } from '@/hooks/useSearch';
import type { ContentItem } from '@/lib/types/content';

const CATEGORIES: SearchCategory[] = ['All', 'Movies', 'TV', 'Docs'];

export default function BrowseScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<SearchCategory>('All');

  // Debounce keystrokes so we don't fire a search per character.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isFetching } = useSearch(debounced, category);
  const searching = debounced.trim().length >= 2;

  const openDetail = (item: ContentItem) =>
    router.push({
      pathname: '/detail/[id]',
      params: { id: item.id, title: item.title, image: item.image },
    });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Search input */}
      <View className="px-5 pt-2">
        <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3">
          <Search size={18} color="rgba(245,241,232,0.62)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
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

        {/* Category pills — only while searching */}
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
                      ? 'rounded-pill bg-foreground px-3.5 py-1.5'
                      : 'rounded-pill border border-border bg-card px-3.5 py-1.5 active:bg-secondary'
                  }>
                  <Text
                    className={
                      active
                        ? 'font-sans-bold text-meta text-background'
                        : 'font-sans-medium text-meta text-muted-foreground'
                    }>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* Body */}
      {!searching ? (
        <EmptyPrompt />
      ) : isFetching && !results ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e85d25" />
        </View>
      ) : results && results.length > 0 ? (
        <FlashList
          data={results}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PosterGridCard item={item} onPress={openDetail} />}
          contentContainerStyle={{ padding: 14 }}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <NoResults query={debounced} />
      )}
    </SafeAreaView>
  );
}

function EmptyPrompt() {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-card">
        <Search size={28} color="rgba(245,241,232,0.4)" />
      </View>
      <Text className="mt-4 text-center font-display text-section text-foreground">
        Find something to watch
      </Text>
      <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
        Search by title — films, series, and documentaries across your services.
      </Text>
    </View>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <Text className="text-center font-display text-section text-foreground">No matches</Text>
      <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
        Nothing found for “{query.trim()}”. Try a different title.
      </Text>
    </View>
  );
}
