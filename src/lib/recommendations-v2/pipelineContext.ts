/**
 * Recommendations V2 — Pipeline Context Builder (Phase 5)
 *
 * Constructs a PipelineContext object client-side for the contextual
 * scorer. Used by:
 *   - useForYouContent.ts (client fallback path) — passes the result
 *     directly to scoreCandidates(...).
 *   - edgeRender.ts — extracts { hourOfDay, dayOfWeek } and includes
 *     them in the render-foryou-rows POST body so the Edge Function
 *     scores against the same time-of-day as the client.
 *
 * Decision 9 of the Phase 5 plan: time-of-day source-of-truth is the
 * client's local time (`new Date().getHours()`). The Edge Function
 * reads from the request body and falls back to UTC if absent. This
 * keeps the two paths in lockstep on the bucket they computed against
 * without requiring a profiles.timezone field (deferred to Phase 6+).
 *
 * Failure mode: any sub-step that throws (Capacitor not available,
 * Supabase down, profile row missing) yields a missing field in the
 * returned context, not an exception. The contextual scorer falls
 * back to neutral 0.5 per missing field — graceful degradation.
 */

import { Device } from '@capacitor/device';
import { supabase } from '../supabase';
import { getAuthUserId, isSupabaseActive } from '../storage';
import type { PipelineContext, ViewingContext } from './types';

const VIEWING_CONTEXT_VALUES: readonly ViewingContext[] = [
  'solo',
  'with_partner',
  'with_family',
  'with_friends',
  'wind_down',
  'background',
  'focused',
];

function narrowViewingContext(raw: unknown): ViewingContext | null {
  if (typeof raw !== 'string') return null;
  return (VIEWING_CONTEXT_VALUES as readonly string[]).includes(raw)
    ? (raw as ViewingContext)
    : null;
}

export async function buildPipelineContext(): Promise<PipelineContext> {
  const ctx: PipelineContext = {};

  // Local time — both hour and day-of-week. They're sent together to
  // the Edge so calendar-boundary rollovers (late-Sun-night → Mon UTC)
  // don't desync.
  const now = new Date();
  ctx.hourOfDay = now.getHours();
  ctx.dayOfWeek = now.getDay();

  // Device platform via Capacitor. Web is the dev-server case; treat
  // as 'web' so the device sub-component goes neutral (no penalty).
  try {
    const info = await Device.getInfo();
    if (info.platform === 'android' || info.platform === 'ios' || info.platform === 'web') {
      ctx.devicePlatform = info.platform;
    }
  } catch {
    // Capacitor plugin unavailable — leave devicePlatform unset.
  }

  // viewing_context from the user's profile row. Onboarding writes it
  // (OnboardingFlow.tsx:198); legacy users pre-migration 012 may have
  // null. Either way, missing → neutral viewing sub-score. Narrow the
  // raw DB string against the ViewingContext union; unknown values fall
  // through to null rather than poisoning the scorer (IN-PX-27).
  if (isSupabaseActive()) {
    const userId = getAuthUserId();
    if (userId) {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('viewing_context')
          .eq('id', userId)
          .maybeSingle();
        const narrowed = narrowViewingContext(data?.viewing_context);
        if (narrowed) ctx.viewingContext = narrowed;
      } catch {
        // Network or RLS error — leave viewingContext unset.
      }
    }
  }

  return ctx;
}
