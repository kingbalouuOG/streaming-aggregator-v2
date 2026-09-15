/**
 * growth_events insert for the videx-api Worker (Growth G0-6, migration 090).
 * Service-role only: the table has RLS on and no policies.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { GrowthEventRow } from './growthEvents';

export async function insertGrowthEvent(client: SupabaseClient, row: GrowthEventRow): Promise<void> {
  const { error } = await client.from('growth_events').insert(row);
  // postgrest messages can name schema objects: callers log, never return them.
  if (error) throw new Error(`growth_events insert failed: ${error.message}`);
}
