import { Share2, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Platform, Pressable, Share, Text } from 'react-native';

import { sendGrowthEvent } from '@/attribution';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { GrowthMetadata } from '@/lib/growth/growthEvents';
import { parseInboundLink, type InboundObject, type SrcOrigin, type ViaChannel } from '@/lib/growth/inboundLink';
import {
  buildListShareCopy,
  buildRoomShareCopy,
  buildTitleShareCopy,
  shareSheetContent,
  withShareAttribution,
  type ShareCopy,
  type ShareMomentType,
} from '@/lib/growth/shareCopy';
import { titlePageUrl } from '@/lib/growth/slug';
import { householdErrorCode, householdErrorCopy } from '@/lib/household/errors';
import { sharedListUrl } from '@/lib/household/links';
import { createInvite } from '@/lib/household/rpc';
import { getSessionSrc } from '@/lib/instrumentation/sessionOrigin';
import { emitShare } from '@/lib/storage/interactions';
import { supabase } from '@/lib/supabase';

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
// Shared list (Growth G2): the household's list URL, with ?via=household.
// The owner's tap mints a fresh invite first (create_invite, which revokes
// the previous one) and the URL carries ?invite={token}; a member shares the
// plain list URL, which shows a recipient the preview and "Ask for an invite
// link". Owners see Invite, members see Share.
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
    }
  | {
      listId: string;
      listName: string;
      householdName: string;
      count: number;
      householdId: string;
      /** Owners mint an invite; members share the plain list URL. */
      isOwner: boolean;
    };

async function openSheet(
  copy: ShareCopy,
  object: InboundObject,
  src: SrcOrigin,
  metadata: GrowthMetadata,
  onShared?: (activityType: string | null) => void,
  via: ViaChannel = 'share',
): Promise<void> {
  sendGrowthEvent({ name: 'share_initiated', object, via, src, metadata });
  const result = await Share.share(shareSheetContent(copy, Platform.OS));
  if (result.action !== Share.sharedAction) return;
  const activityType = result.activityType ?? null;
  sendGrowthEvent({
    name: 'share_completed',
    object,
    via,
    src,
    metadata: { ...metadata, to_surface: activityType, platform_reports_completion: Platform.OS === 'ios' },
  });
  onShared?.(activityType);
}

/** Opens the share sheet for a title, room or shared list. Throws only if the OS sheet does. */
export async function runShare(target: ShareTarget): Promise<void> {
  const src = getSessionSrc();

  if ('listId' in target) {
    let token: string | null = null;
    if (target.isOwner) {
      try {
        token = (await createInvite(supabase, target.householdId)).token;
      } catch (e) {
        Alert.alert("Couldn't make an invite", householdErrorCopy(householdErrorCode(e)));
        return;
      }
    }
    const copy = buildListShareCopy({
      householdName: target.householdName,
      count: target.count,
      url: withShareAttribution(sharedListUrl(target.listId, token), src, 'household'),
    });
    await openSheet(copy, { type: 'list', id: target.listId }, src, { surface: 'list' }, undefined, 'household');
    return;
  }

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
  const { top } = props;
  const [busy, setBusy] = useState(false);
  const moment = 'contentId' in props ? props.moment : null;
  const invite = 'listId' in props && props.isOwner;

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await runShare(props);
    } catch {
      // User cancelled or the OS sheet failed — non-fatal.
    } finally {
      setBusy(false);
    }
  };

  const position = top === undefined ? '' : 'absolute right-4 ';
  const style = top === undefined ? { opacity: busy ? 0.6 : 1 } : { top, opacity: busy ? 0.6 : 1 };

  // A household owner's share is an invite: a labelled pill says so.
  if (invite) {
    return (
      <Pressable
        onPress={onShare}
        disabled={busy}
        accessibilityLabel="Invite to the household"
        hitSlop={4}
        style={style}
        className={`${position}h-9 flex-row items-center gap-1.5 rounded-md bg-primary px-3 active:opacity-80`}>
        <UserPlus size={16} color="#ffffff" />
        <Text className="font-sans-bold text-meta text-white">Invite</Text>
      </Pressable>
    );
  }

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
