import { Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Platform, Pressable, Share } from 'react-native';

import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { titlePageUrl } from '@/lib/growth/slug';
import { emitShare } from '@/lib/storage/interactions';

// Share action, top-right over a full-bleed page (mirrors BackButton).
//
// Title (H0 Stream B — Share v1): shares the canonical title page
// https://videxstreaming.com/t/{type}/{tmdbId}-{slug} (ADR-015) — an
// OG-tagged "where to watch X in the UK" page that is also a universal /
// app link back into the app — and logs a `share` event.
//
// URL (Growth S1): shares a plain URL, or one produced on tap (a room
// snapshot is created by POST /v1/share/room before the sheet opens).
// Copy and share events for these are S4's; no event is logged here.

// `top` pins the button top-right over a full-bleed page; omit it to lay
// the button out inline (e.g. inside a room card's kicker row).
type ShareButtonProps = { top?: number } & (
  | {
      contentId: string; // "movie-12345" / "tv-12345"
      title: string;
      year?: number | null;
      url?: never;
    }
  | {
      url: string | (() => Promise<string | null>);
      contentId?: never;
      title?: never;
      year?: never;
    }
);

export function ShareButton(props: ShareButtonProps) {
  const { top } = props;
  const [busy, setBusy] = useState(false);

  const shareTitle = async (contentId: string, title: string, year?: number | null) => {
    const { tmdbId, mediaType } = parseContentItemId(contentId);
    const shareUrl = titlePageUrl(mediaType, tmdbId, title, year);
    const yearStr = year ? ` (${year})` : '';
    const message = `${title}${yearStr} — where to watch in the UK\n${shareUrl}`;
    // iOS uses a separate `url` field; Android folds everything into message.
    const result = await Share.share(Platform.OS === 'ios' ? { message, url: shareUrl } : { message });
    if (result.action === Share.sharedAction) {
      emitShare({
        contentId: tmdbId,
        mediaType,
        sharedUrl: shareUrl,
        toSurface: result.activityType ?? null,
      });
    }
  };

  const shareUrl = async (url: string | (() => Promise<string | null>)) => {
    const resolved = typeof url === 'function' ? await url() : url;
    if (!resolved) {
      Alert.alert("Couldn't share", 'Check your connection and try again.');
      return;
    }
    await Share.share(Platform.OS === 'ios' ? { url: resolved } : { message: resolved });
  };

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (props.contentId !== undefined) {
        await shareTitle(props.contentId, props.title, props.year);
      } else {
        await shareUrl(props.url);
      }
    } catch {
      // User cancelled or the OS sheet failed — non-fatal.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={onShare}
      disabled={busy}
      accessibilityLabel="Share"
      hitSlop={4}
      style={top === undefined ? { opacity: busy ? 0.6 : 1 } : { top, opacity: busy ? 0.6 : 1 }}
      className={`${top === undefined ? '' : 'absolute right-4 '}h-9 w-9 items-center justify-center rounded-md bg-[#14141c]/60 active:bg-[#14141c]`}>
      <Share2 size={18} color="#ffffff" />
    </Pressable>
  );
}
