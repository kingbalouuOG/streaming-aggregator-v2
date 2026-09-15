/**
 * Add-on channel entitlements — client storage (IN-SC-004, migration 086).
 *
 * Channels that are standalone services (HBO Max, Paramount+ …) are held
 * through `user_services` like any other service; everything else a user
 * holds inside Prime / Apple / NOW lives in `user_service_addons`. RLS
 * scopes both reads to the signed-in user, so no user id is passed.
 */

import { supabase } from '../supabase';
import { fetchChannelRegistry, type ChannelRegistryRow } from '../entitlements/channels';

/** The curated registry (public read). */
export function getChannelRegistry(): Promise<ChannelRegistryRow[]> {
  return fetchChannelRegistry(supabase);
}

/** Non-standalone channel ids the signed-in user holds. Throws on a read
 *  error so a caller never mistakes "couldn't read" for "holds none". */
export async function getUserChannels(): Promise<string[]> {
  const { data, error } = await supabase.from('user_service_addons').select('channel_id');
  if (error) throw new Error(`user_service_addons read failed: ${error.message}`);
  return (data ?? []).map((r) => r.channel_id).sort();
}

/** Atomically replace the user's channels. Unknown, uncurated and
 *  standalone-mapped ids are dropped server-side; returns the kept set. */
export async function setUserChannels(channelIds: string[]): Promise<string[]> {
  const { data, error } = await supabase.rpc('set_own_service_addons', { p_channel_ids: channelIds });
  if (error) throw new Error(`set_own_service_addons failed: ${error.message}`);
  return data ?? [];
}
