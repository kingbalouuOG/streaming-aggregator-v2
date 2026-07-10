/**
 * Onboarding draft persistence (beta feedback 2026-07-09).
 *
 * The founder hit a resume loop: exiting the app mid-onboarding (step 4)
 * and returning dropped him back to step 2 with services unselected and
 * watch-history picks lost, taking 2-3 loops to finish. Root cause:
 * OnboardingFlow held step index + all selections in useState only, and
 * the (tabs) guard remounts OnboardingFlow whenever onboarding isn't
 * complete (e.g. after an auth session restore) — remount = memory wiped,
 * step reset to `session ? 1 : 0`.
 *
 * Fix: mirror the flow's collected state into MMKV as a "draft" on every
 * change, restore it synchronously on mount, and clear it on completion.
 * The draft also carries the ORIGINAL onboarding start timestamp so a
 * resume doesn't reset the duration clock, and a `startedLogged` flag so
 * `onboarding_started` fires exactly once across resumes.
 *
 * MMKV is used directly (synchronous) rather than the async `@/lib/storage`
 * seam so restore happens in the initial render — no flash of step 1 before
 * an async read lands. Native-only module (the web OnboardingFlow does not
 * remount the same way, so it has no counterpart).
 */

import { createMMKV } from 'react-native-mmkv';

import type { SliderState } from '@/lib/taste-v2/types';
import type { ServiceId } from '@/lib/types/content';

const mmkv = createMMKV({ id: 'videx-onboarding-draft' });
const KEY = 'draft';

// Bump when the shape changes so a stale-shaped draft is ignored, not
// restored into a mismatched flow.
const VERSION = 1;

export interface OnboardingDraft {
  version: number;
  /** ms epoch — original onboarding start, preserved across resumes. */
  startedAt: number;
  /** Whether `onboarding_started` has already been logged (once-only). */
  startedLogged: boolean;
  step: number;
  ageRange: string | null;
  viewingContext: string | null;
  services: ServiceId[];
  /** Serialised Set<string> of watched keys ("movie-123"). */
  watchedKeys: string[];
  watchedRound: number;
  watchedOffset: number;
  selectedClusters: string[];
  sliders: SliderState;
}

export type OnboardingDraftPatch = Partial<Omit<OnboardingDraft, 'version'>>;

/** Read the persisted draft, or null if absent / stale-shaped / corrupt. */
export function readOnboardingDraft(): OnboardingDraft | null {
  try {
    const raw = mmkv.getString(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingDraft;
    if (parsed?.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Merge a patch into the draft and persist it. The first write with no
 * existing draft seeds `startedAt`/`startedLogged` defaults so callers only
 * pass the fields that changed.
 */
export function writeOnboardingDraft(patch: OnboardingDraftPatch): void {
  try {
    const current = readOnboardingDraft();
    const base: OnboardingDraft = current ?? {
      version: VERSION,
      startedAt: Date.now(),
      startedLogged: false,
      step: 0,
      ageRange: null,
      viewingContext: null,
      services: [],
      watchedKeys: [],
      watchedRound: 0,
      watchedOffset: 0,
      selectedClusters: [],
      sliders: patch.sliders ?? ({} as SliderState),
    };
    const next: OnboardingDraft = { ...base, ...patch, version: VERSION };
    mmkv.set(KEY, JSON.stringify(next));
  } catch {
    // Persistence is best-effort — a failed write must never break the flow.
  }
}

/** Remove the draft (call on completion, or to force a clean restart). */
export function clearOnboardingDraft(): void {
  try {
    mmkv.remove(KEY);
  } catch {
    // ignore
  }
}
