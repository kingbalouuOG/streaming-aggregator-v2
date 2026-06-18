import { Check, MessageSquare, ThumbsDown, ThumbsUp, EyeOff } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { trackTasteInteraction } from '@/instrumentation/trackInteraction';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import {
  exitDwell,
  setLastAction,
  startDwell,
} from '@/lib/instrumentation/dwellTimer';
import { emitDetailView, markNotInterested } from '@/lib/storage/interactions';
import { setWatchlistRating } from '@/lib/storage/watchlist';
import type { ServiceId } from '@/lib/types/content';
import { ReportSheet } from './ReportSheet';

// Detail-page engagement (NATIVE polish W1) — the signals that feed the
// engine. Dwell lifecycle + detail_view on mount/unmount; thumbs up/down
// (EMA via trackTasteInteraction + best-effort watchlist rating); Not
// interested (markNotInterested); availability report.

interface DetailEngagementProps {
  itemId: string;
  title: string;
  mediaType: 'movie' | 'tv';
  genreIds?: number[];
  services: ServiceId[];
  onBack: () => void;
}

export function DetailEngagement({ itemId, title, mediaType, genreIds, services, onBack }: DetailEngagementProps) {
  const { tmdbId } = parseContentItemId(itemId);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);

  // Dwell + detail_view anchor (IN-001/IN-002). Re-armed on every focus,
  // not just mount: native stacks detail pages (a "More like this" tap
  // pushes another /detail/[id], leaving this one mounted-but-blurred), so
  // a mount-only effect would never restart the parent's dwell on return.
  // useFocusEffect starts a fresh dwell each time the page regains focus —
  // matching web, where every view is a fresh mount. exitDwell (on blur)
  // is idempotent.
  useFocusEffect(
    useCallback(() => {
      startDwell(tmdbId, mediaType);
      emitDetailView(tmdbId, mediaType, title);
      return () => exitDwell();
    }, [tmdbId, mediaType, title]),
  );

  const meta = { contentId: tmdbId, contentType: mediaType, title, genreIds };

  const rate = (next: 'up' | 'down') => {
    const value = rating === next ? null : next;
    setRating(value);
    setLastAction(next === 'up' ? 'thumbs_up' : 'thumbs_down');
    if (value) {
      void trackTasteInteraction(meta, next === 'up' ? 'thumbs_up' : 'thumbs_down');
      // Best-effort persist on the watchlist row (no-op if not listed).
      void setWatchlistRating(tmdbId, mediaType, next === 'up' ? 1 : -1);
    } else {
      void setWatchlistRating(tmdbId, mediaType, 0);
    }
  };

  const notInterested = async () => {
    exitDwell('not_interested');
    try {
      await markNotInterested(tmdbId, mediaType);
    } catch {
      // non-fatal
    }
    onBack();
  };

  return (
    <View className="mt-4">
      <View className="flex-row items-center gap-2">
        <RateButton
          active={rating === 'up'}
          activeBg="bg-success"
          onPress={() => rate('up')}
          icon={<ThumbsUp size={15} color={rating === 'up' ? '#fff' : 'rgba(245,241,232,0.62)'} fill={rating === 'up' ? '#fff' : 'transparent'} />}
        />
        <RateButton
          active={rating === 'down'}
          activeBg="bg-danger"
          onPress={() => rate('down')}
          icon={<ThumbsDown size={15} color={rating === 'down' ? '#fff' : 'rgba(245,241,232,0.62)'} fill={rating === 'down' ? '#fff' : 'transparent'} />}
        />
        <Pressable
          onPress={notInterested}
          accessibilityLabel="Not interested"
          className="h-8 w-8 items-center justify-center rounded-md border border-border bg-card active:bg-secondary">
          <EyeOff size={15} color="rgba(245,241,232,0.62)" />
        </Pressable>
      </View>

      {services.length > 0 ? (
        <Pressable onPress={() => !reported && setReportOpen(true)} className="mt-3 flex-row items-center gap-1.5">
          {reported ? (
            <>
              <Check size={14} color="rgba(245,241,232,0.4)" />
              <Text className="font-sans text-meta text-faint-foreground">Report submitted — thanks!</Text>
            </>
          ) : (
            <>
              <MessageSquare size={14} color="rgba(245,241,232,0.4)" />
              <Text className="font-sans text-meta text-faint-foreground">Services wrong? Report here</Text>
            </>
          )}
        </Pressable>
      ) : null}

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        tmdbId={tmdbId}
        mediaType={mediaType}
        services={services}
        onReported={() => setReported(true)}
      />
    </View>
  );
}

function RateButton({
  active,
  activeBg,
  onPress,
  icon,
}: {
  active: boolean;
  activeBg: string;
  onPress: () => void;
  icon: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={
        active
          ? `h-8 w-8 items-center justify-center rounded-md ${activeBg}`
          : 'h-8 w-8 items-center justify-center rounded-md border border-border bg-card active:bg-secondary'
      }>
      {icon}
    </Pressable>
  );
}
