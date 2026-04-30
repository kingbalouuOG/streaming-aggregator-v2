// Mirror of src/lib/recommendations-v2/contextual.ts — IN-466 / ADR-011.
// Pure module; bit-for-bit copy. Drift enforced by shared-tree-drift CI.

import type { ScoredCandidate } from './types.ts';

export function computeContextualScore(_candidate: Pick<ScoredCandidate, 'meta'>): number {
  return 0.5;
}
