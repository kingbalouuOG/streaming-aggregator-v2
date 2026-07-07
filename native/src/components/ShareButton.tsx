import { Share2 } from 'lucide-react-native';
import { Platform, Pressable, Share } from 'react-native';

import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { env } from '@/lib/env';
import { emitShare } from '@/lib/storage/interactions';

// Detail-page share action (H0 Stream B — Share v1, the growth loop).
// Shares a smart link to the Worker title page (GET /t/:type/:tmdbId) — an
// OG-tagged, crawlable "where to watch X in the UK" page that also carries
// store links + a deep-link attempt back into the app. Logs a `share` event.

export function ShareButton({
  contentId,
  title,
  year,
  top,
}: {
  contentId: string; // "movie-12345" / "tv-12345"
  title: string;
  year?: number | null;
  top: number;
}) {
  const { tmdbId, mediaType } = parseContentItemId(contentId);

  const onShare = async () => {
    const base = env.API_PROXY_URL?.replace(/\/$/, '');
    const shareUrl = base ? `${base}/t/${mediaType}/${tmdbId}` : undefined;
    const yearStr = year ? ` (${year})` : '';
    const message = shareUrl
      ? `${title}${yearStr} — where to watch in the UK\n${shareUrl}`
      : `${title}${yearStr} — on Videx`;

    try {
      // iOS uses a separate `url` field; Android folds everything into message.
      const result = await Share.share(
        Platform.OS === 'ios' && shareUrl ? { message, url: shareUrl } : { message },
      );
      if (result.action === Share.sharedAction) {
        emitShare({
          contentId: tmdbId,
          mediaType,
          sharedUrl: shareUrl ?? '',
          toSurface: result.activityType ?? null,
        });
      }
    } catch {
      // User cancelled or the OS sheet failed — non-fatal.
    }
  };

  return (
    <Pressable
      onPress={onShare}
      accessibilityLabel="Share"
      style={{ top }}
      className="absolute right-4 h-9 w-9 items-center justify-center rounded-md bg-[#14141c]/60 active:bg-[#14141c]">
      <Share2 size={18} color="#ffffff" />
    </Pressable>
  );
}
