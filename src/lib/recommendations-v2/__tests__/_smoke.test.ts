// Placeholder smoke test (Phase 5.5 C6a). Confirms the vitest rig
// discovers and runs tests under src/lib/**/__tests__/ before the
// real test cases land in C6b. Delete in C6b once contextual.test.ts
// and diversity.test.ts replace it.

import { describe, expect, it } from 'vitest';

describe('vitest rig smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
