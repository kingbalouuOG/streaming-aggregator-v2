import { Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Platform, Pressable, Share, Text } from 'react-native';

import { sendGrowthEvent } from '@/attribution';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { GrowthMetadata } from '@/lib/growth/growthEvents';
import { parseInboundLink, type InboundObject, type SrcOrigin } from '@/lib/growth/inboundLink';
import {
  buildRoomShareCopy,
  buildTitleShareCopy,
  shareSheetContent,
  withShareAttribution,
  type ShareCopy,
  type ShareMomentType,
} from '@/lib/growth/shareCopy';
import { titlePageUrl } from '@/lib/growth/slug';
import { getSessionSrc } from '@/lib/instrumentation/sessionOrigin';
import { emitShare } from '@/lib/storage/interactions';

// Share action, top-right over a full-bleed page (mirrors BackButton).
//
// Title (H0 Stream B, copy and events Growth S4): shares the canonical title
// page https://videxstreaming.com/t/{type}/{tmdbId}-{slug} (ADR-015) with the
// UK availability line (src/lib/growth/shareCopy.ts), and keeps logging the
// ranking-side `share` interaction on completion.
//
// Room (Growth S1, copy and events S4): shares a room snapshot URL, given or
// produced on tap (a room card snapshots the room with POST /v1/share/room
// first). No `share` interaction for rooms.
//
// Every share records share_initiated when the sheet opens and
// share_completed when the OS reports it (growth_events, plan G1-2). The URL
// carries ?via=share, plus &src=push in a session a push tap opened. Android
// reports sharedAction on dismiss too, so share_completed says whether the
// platform's completion can be trusted.

export interface ShareAvailability {
  /** Service ids streaming it on a subscription or free tier (no add-on channels). */
  subscriptionServices: string[];
  /** Service ids renting or selling it. */
  rentBuyServices: string[];
}

/** The "Tell someone" state: a push tap opened this title. */
export interface ShareMomentState {
  type: ShareMomentType;
  /** Leads the share message, e.g. "Just landed on Apple TV+". */
  line: string;
}

export type ShareTarget =
  | {
      contentId: string; // "movie-12345" / "tv-12345"
      title: string;
      year?: number | null;
      availability: ShareAvailability;
      moment?: ShareMomentState | null;
    }
  | {
      url: string | (() => Promise<string | null>);
      label: string;
      count: number;
      surface: 'room' | 'room_card';
    };

async function openSheet(
  copy: ShareCopy,
  object: InboundObject,
  src: SrcOrigin,
  metadata: GrowthMetadata,
  onShared?: (activityType: string | null) => void,
): Promise<void> {
  sendGrowthEvent({ name: 'share_initiated', object, via: 'share', src, metadata });
  const result = await Share.share(shareSheetContent(copy, Platform.OS));
  if (result.action !== Share.sharedAction) return;
  const activityType = result.activityType ?? null;
  sendGrowthEvent({
    name: 'share_completed',
    object,
    via: 'share',
    src,
    metadata: { ...metadata, to_surface: activityType, platform_reports_completion: Platform.OS === 'ios' },
  });
  onShared?.(activityType);
}

/** Opens the share sheet for a title or room. Throws only if the OS sheet does. */
export async function runShare(target: ShareTarget): Promise<void> {
  const src = getSessionSrc();

  if ('contentId' in target) {
    const { tmdbId, mediaType } = parseContentItemId(target.contentId);
    const canonical = titlePageUrl(mediaType, tmdbId, target.title, target.year);
    const copy = buildTitleShareCopy({
      title: target.title,
      year: target.year,
      subscriptionServices: target.availability.subscriptionServices,
      rentBuyServices: target.availability.rentBuyServices,
      url: withShareAttribution(canonical, src),
      momentLine: target.moment?.line ?? null,
    });
    const metadata: GrowthMetadata = { surface: 'detail' };
    if (target.moment) metadata.moment = target.moment.type;
    await openSheet(copy, { type: 'title', id: `${mediaType}-${tmdbId}` }, src, metadata, (activityType) =>
      emitShare({ contentId: tmdbId, mediaType, sharedUrl: canonical, toSurface: activityType }),
    );
    return;
  }

  const resolved = typeof target.url === 'function' ? await target.url() : target.url;
  const object = resolved ? parseInboundLink(resolved).object : null;
  if (!resolved || object?.type !== 'room') {
    Alert.alert("Couldn't share", 'Check your connection and try again.');
    return;
  }
  const copy = buildRoomShareCopy({
    label: target.label,
    count: target.count,
    url: withShareAttribution(resolved, src),
  });
  await openSheet(copy, object, src, { surface: target.surface });
}

// `top` pins the button top-right over a full-bleed page; omit it to lay
// the button out inline (e.g. inside a room card's kicker row).
type ShareButtonProps = { top?: number } & ShareTarget;

export function ShareButton(props: ShareButtonProps) {
  const { top, ...target } = props;
  const [busy, setBusy] = useState(false);
  const moment = 'contentId' in target ? target.moment : null;

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await runShare(target as ShareTarget);
    } catch {
      // User cancelled or the OS sheet failed — non-fatal.
    } finally {
      setBusy(false);
    }
  };

  const position = top === undefined ? '' : 'absolute right-4 ';
  const style = top === undefined ? { opacity: busy ? 0.6 : 1 } : { top, opacity: busy ? 0.6 : 1 };

  // "Tell someone": the same spot, promoted to a labelled accent pill.
  if (moment) {
    return (
      <Pressable
        onPress={onShare}
        disabled={busy}
        accessibilityLabel="Tell someone"
        hitSlop={4}
        style={style}
        className={`${position}h-9 flex-row items-center gap-1.5 rounded-md bg-primary px-3 active:opacity-80`}>
        <Share2 size={16} color="#ffffff" />
        <Text className="font-sans-bold text-meta text-white">Tell someone</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onShare}
      disabled={busy}
      accessibilityLabel="Share"
      hitSlop={4}
      style={style}
      className={`${position}h-9 w-9 items-center justify-center rounded-md bg-[#14141c]/60 active:bg-[#14141c]`}>
      <Share2 size={18} color="#ffffff" />
    </Pressable>
  );
}
