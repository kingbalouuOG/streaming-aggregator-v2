/**
 * service_id → the label shared copy uses (Growth S4).
 *
 * One map for the Worker's title page ("Stream now on …") and the app's
 * share sheet and "Tell someone" copy, so a shared message and the page it
 * opens always name a service the same way. Moved here from
 * workers/api/src/titlePage.ts, which re-exports it.
 *
 * Pure, imported by the Worker and native.
 */

import { SERVICE_DISPLAY_NAMES } from '../types/content';

// The app's own display names: one source, so a rename or a new service shows
// the same in the picker, the share sheet and the Worker page (sweep R1).
export const SHARE_SERVICE_LABELS: Record<string, string> = { ...SERVICE_DISPLAY_NAMES };

/** The label for a service id; an unknown id is returned as given. */
export function shareServiceLabel(serviceId: string): string {
  return SHARE_SERVICE_LABELS[serviceId] ?? serviceId;
}
