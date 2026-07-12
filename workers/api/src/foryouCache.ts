/**
 * Pure helpers for the /v1/foryou feed cache (pre-launch perf batch).
 * No Hono / Workers-runtime imports here so the root vitest rig can unit
 * test them (see foryouCache.test.ts). index.ts wires them to KV + the
 * request lifecycle.
 */

export interface FeedCacheSliders {
  catalogueAge: number;
  comfortZone: number;
  contentMix: number;
  variety: number;
}

/** Stable slider component of the feed cache key. Slider saves don't bump
 *  taste_vector_updated_at, so they're hashed in separately. `none` when
 *  the user has no profile row yet. */
export function sliderHashOf(sliders: FeedCacheSliders | null | undefined): string {
  if (!sliders) return 'none';
  return `${sliders.catalogueAge}.${sliders.comfortZone}.${sliders.contentMix}.${sliders.variety}`;
}

/**
 * Per-user feed cache key. Embeds taste_vector_updated_at so an
 * interaction that moves the vector busts the entry by construction, and
 * the sorted service list so service order/dupes can't mint variants.
 */
export function buildFeedCacheKey(
  userId: string,
  updatedAt: string | number | null | undefined,
  sliders: FeedCacheSliders | null | undefined,
  services: string[],
): string {
  const sorted = [...services].sort().join(',');
  return `foryou:v1:${userId}:${updatedAt ?? 0}:${sliderHashOf(sliders)}:${sorted}`;
}

export interface CoalesceResult<T> {
  promise: Promise<T>;
  /** True for the request that actually started the work; false for
   *  followers that attached to an in-flight render. */
  leader: boolean;
}

/**
 * Single-flight coalescing (finding 3). Between a KV cache miss and the
 * KV put, concurrent requests for the SAME key would each run a full
 * pgvector render (a miss stampede on a hot/just-invalidated feed). This
 * shares one in-flight render across all callers in the isolate: the
 * first caller leads and runs `factory`; the rest await the same promise.
 * The entry is removed once settled (success or failure) so a later miss
 * re-leads, and failures aren't cached — the followers just share the
 * leader's error and fall through to the caller's normal error handling.
 */
export function coalesce<T>(
  inflight: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
): CoalesceResult<T> {
  const existing = inflight.get(key);
  if (existing) return { promise: existing, leader: false };

  const promise = factory();
  inflight.set(key, promise);
  // Only delete if still the same promise — a re-lead after settle must
  // not be clobbered. `.catch` swallows the cleanup chain's rejection so
  // it never surfaces as an unhandled rejection (the real promise is
  // still awaited by leader + followers).
  promise
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    })
    .catch(() => {});
  return { promise, leader: true };
}
