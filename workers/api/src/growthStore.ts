/**
 * growth_events insert for the videx-api Worker (Growth G0-6, migration 090).
 * Service-role only: the table has RLS on and no policies.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { GrowthEventRow } from './growthEvents';

export async function insertGrowthEvent(client: SupabaseClient, row: GrowthEventRow): Promise<void> {
  const { error } = await client.from('growth_events').insert(row);
  if (error && error.code === '23503' && row.user_id) {
    // A verified token for an account deleted within the last hour: the
    // profiles row is gone, so keep the event and drop the attribution
    // rather than lose it (sweep, finder A 6).
    const retry = await client.from('growth_events').insert({ ...row, user_id: null });
    if (!retry.error) return;
    throw new Error(`growth_events insert failed: ${retry.error.message}`);
  }
  // postgrest messages can name schema objects: callers log, never return them.
  if (error) throw new Error(`growth_events insert failed: ${error.message}`);
}
