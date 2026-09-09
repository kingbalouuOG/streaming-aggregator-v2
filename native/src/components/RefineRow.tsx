import { ChevronDown, SlidersHorizontal, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SORT_LABELS, type BrowseFilters, type SortMode } from '@/components/browseFilters';
import {
  orderedRefineChips,
  type RefineChip,
  type RefineField,
} from '@/lib/content/refineChips';

// The refine row (recommendation 2026-09-08-002 §9.2, prototype states 3–4).
//
// This replaces TWO earlier control blocks, which is the point rather than a
// side effect:
//
//   - The category pills (All / Movies / TV / Docs). They filtered Mode A's
//     result list client-side, so on the described route — where the grid
//     comes from the engine — tapping Movies changed nothing on screen while
//     quietly re-running Mode A and writing a log row. Device testing
//     2026-09-09 caught it. Media type is now `contentType`, which every path
//     applies where the results actually come from.
//   - The Filters + Sort row. Folded in here rather than stacked above or
//     below, because two rows of controls over a 390pt grid is most of the
//     first screenful.
//
// Each chip is one existing `BrowseFilters` field (see `refineChips.ts`, which
// holds every rule that can be tested without a renderer). Toggling one
// changes `intent.filters`, which is part of both the `/discover` and the
// semantic query keys — so a tap refetches rather than thinning what is
// already on screen. That is the whole difference between this and the pills.
//
// Hidden on a confident title hit. The caller enforces that; there is nothing
// to refine about a title the user has already named.

const SORT_MODES: SortMode[] = ['best', 'popularity', 'rating', 'a_z', 'z_a'];

interface RefineRowProps {
  filters: BrowseFilters;
  /** Toggle one chip. The caller owns the filter state and the logging. */
  onToggle: (chip: RefineChip) => void;
  /** Total active filters, including the sheet-only axes. */
  activeCount: number;
  onOpenSheet: () => void;
  /** Reset every filter and the active preset. Omit to hide the control. */
  onClearAll?: () => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  /**
   * How many titles are on screen. Rendered as the count line, which is what
   * makes a refetch legible: a tap that changes the grid but not any visible
   * number reads as a control that did nothing.
   */
  resultCount: number;
  /** Suppresses the count while a refetch is in flight, rather than lying. */
  loading?: boolean;
  /**
   * True when the grid is post-filtered client-side (Mode A with the
   * `search_semantic` flag off) rather than refetched. Withholds the chips
   * `applyBrowseFilters` cannot honour — see `orderedRefineChips`.
   */
  clientSideOnly?: boolean;
}

export function RefineRow({
  filters,
  onToggle,
  activeCount,
  onOpenSheet,
  onClearAll,
  sortMode,
  onSortChange,
  resultCount,
  loading = false,
  clientSideOnly = false,
}: RefineRowProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const chips = orderedRefineChips(filters, clientSideOnly);

  return (
    <View className="mt-3">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {chips.map((chip) => (
          <Chip key={chip.field} chip={chip} active={chip.isOn(filters)} onPress={() => onToggle(chip)} />
        ))}
      </ScrollView>

      <View className="mt-3 flex-row items-center justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
            {loading ? 'Refining…' : `${resultCount} ${resultCount === 1 ? 'title' : 'titles'}`}
          </Text>
          {onClearAll && activeCount > 0 ? (
            <Pressable
              onPress={onClearAll}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              className="flex-row items-center gap-1 rounded-pill px-2 py-1.5 active:opacity-70">
              <X size={12} color="rgba(245,241,232,0.5)" />
              <Text className="font-sans-medium text-meta text-faint-foreground">Clear all</Text>
            </Pressable>
          ) : null}
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={onOpenSheet}
            accessibilityRole="button"
            accessibilityLabel={
              activeCount > 0 ? `More filters, ${activeCount} active` : 'More filters'
            }
            className={
              activeCount > 0
                ? 'flex-row items-center gap-1.5 rounded-pill border border-primary-edge bg-primary-soft px-3 py-1.5'
                : 'flex-row items-center gap-1.5 rounded-pill border border-border bg-card px-3 py-1.5 active:bg-secondary'
            }>
            <SlidersHorizontal
              size={12}
              color={activeCount > 0 ? '#e85d25' : 'rgba(245,241,232,0.62)'}
            />
            <Text
              className={
                activeCount > 0
                  ? 'font-sans-bold text-meta text-primary'
                  : 'font-sans-medium text-meta text-muted-foreground'
              }>
              {activeCount > 0 ? `More · ${activeCount}` : 'More filters'}
            </Text>
          </Pressable>

          <View>
            <Pressable
              onPress={() => setSortOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${SORT_LABELS[sortMode]}`}
              className="flex-row items-center gap-1 rounded-pill border border-border bg-card px-3 py-1.5 active:bg-secondary">
              <Text className="font-sans-medium text-meta text-muted-foreground">
                {SORT_LABELS[sortMode]}
              </Text>
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
                      onSortChange(m);
                      setSortOpen(false);
                    }}
                    className="px-3 py-2 active:bg-secondary">
                    <Text
                      className={
                        m === sortMode
                          ? 'font-sans-bold text-meta text-primary'
                          : 'font-sans-medium text-meta text-muted-foreground'
                      }>
                      {SORT_LABELS[m]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * One chip. Active carries an × glyph, so removing a refinement is the same
 * tap target as adding it — the alternative is a lit pill whose only
 * affordance is "tap again", which nobody discovers.
 */
function Chip({
  chip,
  active,
  onPress,
}: {
  chip: RefineChip;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? `Remove ${chip.label}` : `Add ${chip.label}`}
      className={
        active
          ? 'flex-row items-center gap-1.5 rounded-pill border border-primary-edge bg-primary-soft px-3.5 py-1.5'
          : 'flex-row items-center rounded-pill border border-border bg-card px-3.5 py-1.5 active:bg-secondary'
      }>
      <Text
        className={
          active
            ? 'font-sans-bold text-meta text-primary'
            : 'font-sans-medium text-meta text-muted-foreground'
        }>
        {chip.label}
      </Text>
      {active ? <X size={12} color="#e85d25" strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

export type { RefineChip, RefineField };
