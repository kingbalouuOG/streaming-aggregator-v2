/**
 * Add-on channel entitlements (IN-SC-004, migration 086).
 *
 * Prime Video Channels, Apple TV Channels and NOW's passes sell other
 * services inside a parent. The vendor tags those rows `stream_type =
 * 'addon'` with an `addon_id`; migration 086 stores one
 * `<parent>:<addon_id>` token per such row in `titles.channel_services`.
 *
 * This module turns what a user holds into the tokens their availability
 * filter matches:
 *
 *   available_services && <services>  OR  channel_services && <tokens>
 *
 * The rules (brief docs/strategy/briefs/addon-entitlements.md):
 *  - One entitlement per channel however it is bought. A channel that is
 *    also a standalone Videx service (hbo, paramount, discovery,
 *    crunchyroll, mubi) IS that service: holding the service holds the
 *    channel on every parent.
 *  - Any other channel counts on a parent only when the user holds that
 *    parent too.
 *
 * Pure functions plus one registry read, no Vite or Workers imports — the
 * videx-api Worker, the web client and the native app all import this.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ChannelRegistryRow {
  parentServiceId: string;
  addonId: string;
  channelId: string;
  displayName: string;
  /** Set when the channel is a standalone Videx service (equals channelId). */
  standaloneServiceId: string | null;
  sort: number;
}

/** One pickable channel under a parent tile. */
export interface ChannelChoice {
  channelId: string;
  displayName: string;
  standaloneServiceId: string | null;
}

/** Same shape the migration's CHECK constraints enforce. */
export const CHANNEL_ID_RE = /^[a-z0-9_]{1,40}$/;

/** More than the registry could ever hold for one user; a request above it
 *  is not a person. */
export const MAX_CHANNELS = 30;

interface ServiceAddonRow {
  parent_service_id: string;
  addon_id: string;
  channel_id: string;
  display_name: string;
  standalone_service_id: string | null;
  sort: number;
}

/** Curated registry rows. Throws on a read error so callers choose how to
 *  degrade (the Worker fails closed to "no channels"). */
export async function fetchChannelRegistry(client: SupabaseClient): Promise<ChannelRegistryRow[]> {
  const { data, error } = await client
    .from('service_addons')
    .select('parent_service_id, addon_id, channel_id, display_name, standalone_service_id, sort')
    .eq('curated', true);
  if (error) throw new Error(`service_addons read failed: ${error.message}`);
  return ((data ?? []) as ServiceAddonRow[]).map((r) => ({
    parentServiceId: r.parent_service_id,
    addonId: r.addon_id,
    channelId: r.channel_id,
    displayName: r.display_name,
    standaloneServiceId: r.standalone_service_id,
    sort: r.sort,
  }));
}

export function channelToken(parentServiceId: string, addonId: string): string {
  return `${parentServiceId}:${addonId}`;
}

/**
 * The `channel_services` tokens a user can watch, sorted and deduplicated.
 * `services` are user_services ids; `channels` are user_service_addons ids.
 */
export function channelTokensFor(
  registry: ChannelRegistryRow[],
  services: readonly string[],
  channels: readonly string[],
): string[] {
  const heldServices = new Set(services);
  const heldChannels = new Set(channels);
  const out = new Set<string>();
  for (const row of registry) {
    const held = row.standaloneServiceId
      ? heldServices.has(row.standaloneServiceId)
      : heldServices.has(row.parentServiceId) && heldChannels.has(row.channelId);
    if (held) out.add(channelToken(row.parentServiceId, row.addonId));
  }
  return [...out].sort();
}

/**
 * The subset of `channels` the registry knows as non-standalone channels,
 * sorted and deduplicated. Unknown ids are dropped rather than rejected so
 * a channel added to the registry (no release) never breaks an older
 * Worker or client.
 */
export function knownChannelIds(registry: ChannelRegistryRow[], channels: readonly string[]): string[] {
  const known = new Set(
    registry.filter((r) => r.standaloneServiceId === null).map((r) => r.channelId),
  );
  return [...new Set(channels)].filter((c) => known.has(c)).sort();
}

/** Picker chips for one parent tile, in registry order, one per channel. */
export function channelChoicesFor(registry: ChannelRegistryRow[], parentServiceId: string): ChannelChoice[] {
  const byChannel = new Map<string, ChannelRegistryRow>();
  for (const row of registry) {
    if (row.parentServiceId !== parentServiceId) continue;
    const seen = byChannel.get(row.channelId);
    if (!seen || row.sort < seen.sort) byChannel.set(row.channelId, row);
  }
  return [...byChannel.values()]
    .sort((a, b) => a.sort - b.sort || a.displayName.localeCompare(b.displayName))
    .map((r) => ({
      channelId: r.channelId,
      displayName: r.displayName,
      standaloneServiceId: r.standaloneServiceId,
    }));
}

/** Registry display name for a vendor addon row, if curated. */
export function channelDisplayName(
  registry: ChannelRegistryRow[],
  parentServiceId: string,
  addonId: string,
): string | null {
  const row = registry.find((r) => r.parentServiceId === parentServiceId && r.addonId === addonId);
  return row?.displayName ?? null;
}

/** The curated registry row behind a `<parent>:<addon_id>` token, if any. */
export function registryRowForToken(
  registry: ChannelRegistryRow[],
  token: string | null | undefined,
): ChannelRegistryRow | null {
  if (!token) return null;
  return registry.find((r) => channelToken(r.parentServiceId, r.addonId) === token) ?? null;
}

/**
 * How many non-standalone channels the user holds that count somewhere —
 * held, and offered under at least one parent they hold. Channels that are
 * standalone services are counted as services, not here.
 */
export function heldChannelCount(
  registry: ChannelRegistryRow[],
  services: readonly string[],
  channels: readonly string[],
): number {
  const heldServices = new Set(services);
  const heldChannels = new Set(channels);
  const counted = new Set<string>();
  for (const row of registry) {
    if (row.standaloneServiceId === null && heldChannels.has(row.channelId) && heldServices.has(row.parentServiceId)) {
      counted.add(row.channelId);
    }
  }
  return counted.size;
}

/**
 * PostgREST `or` filter for "included on these services, or reachable
 * through a held channel":
 *
 *   available_services.ov.{"netflix","prime"},channel_services.ov.{"prime:shuddertv"}
 *
 * Elements are double-quoted because tokens contain ':' and '.'
 * (`apple:tvs.sbd.1000482`). Use it only when `channelTokens` is non-empty
 * and keep `.overlaps('available_services', services)` otherwise — that
 * shape also works against a database without migration 086.
 */
export function availabilityOrFilter(services: readonly string[], channelTokens: readonly string[]): string {
  const literal = (ids: readonly string[]) => `{${ids.map((id) => `"${id}"`).join(',')}}`;
  return `available_services.ov.${literal(services)},channel_services.ov.${literal(channelTokens)}`;
}

/**
 * Parse a `channels=a,b` query value: lowercased, trimmed, deduplicated,
 * malformed ids dropped. Returns null when the list is over MAX_CHANNELS.
 */
export function parseChannelsParam(raw: string | null | undefined): string[] | null {
  if (!raw) return [];
  const ids = [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (ids.length > MAX_CHANNELS) return null;
  return ids.filter((id) => CHANNEL_ID_RE.test(id));
}

/**
 * Short stable hash of an id list for cache keys (KV keys cap at 512
 * bytes; a token list can exceed that). FNV-1a 32-bit over the sorted,
 * comma-joined ids.
 */
export function hashIdList(ids: readonly string[]): string {
  const input = [...ids].sort().join(',');
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
