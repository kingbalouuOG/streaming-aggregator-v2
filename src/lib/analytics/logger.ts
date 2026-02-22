import { supabase } from '../supabase';
import type { OnboardingEventName, OnboardingEventMetadata } from './events';

export async function logOnboardingEvent<T extends OnboardingEventName>(
  eventName: T,
  metadata: OnboardingEventMetadata[T]
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      console.warn(`[Analytics] No session for '${eventName}'`);
      return;
    }
    const { error } = await supabase.from('onboarding_events').insert({
      user_id: session.user.id,
      event_name: eventName,
      metadata: metadata as Record<string, unknown>,
    });
    if (error) console.error(`[Analytics] Failed '${eventName}':`, error.message);
  } catch (err) {
    console.error(`[Analytics] Error '${eventName}':`, err);
  }
}
