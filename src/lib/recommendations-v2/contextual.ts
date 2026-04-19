/**
 * Recommendations V2 — Contextual Scoring (Phase 4 Placeholder)
 *
 * The 10% contextual fit component is fully specified in Strategy §5.2 as
 * "device, viewing-context → soft nudges only." The actual wiring (device
 * detection, viewing-context handling, time-availability logic) is Phase 5
 * scope per §7.2.
 *
 * Phase 4: returns a neutral score of 0.5 for all candidates. This gives
 * the 10% weight no ranking influence while keeping the pipeline structurally
 * complete. The weight budget is still allocated (other components don't
 * expand to fill it) so Phase 5 drops in without re-tuning weights.
 *
 * Phase 5 replaces this with a real scorer implementing:
 *   - Device type (mobile vs tablet vs TV) → runtime/episode-length nudges
 *   - Time of day → mood-adaptive genre weighting
 *   - Viewing context (solo vs group) → content-type nudges
 *
 * The function signature is designed as a pluggable interface:
 * Phase 5 replaces the implementation without modifying the pipeline
 * orchestrator's call site.
 */

import type { ScoredCandidate } from './types';

/**
 * Compute contextual fit score for a candidate.
 *
 * Phase 4: always returns 0.5 (neutral — no ranking influence).
 * Phase 5: will return 0.0–1.0 based on device, time, and viewing context.
 */
export function computeContextualScore(_candidate: Pick<ScoredCandidate, 'meta'>): number {
  return 0.5;
}
