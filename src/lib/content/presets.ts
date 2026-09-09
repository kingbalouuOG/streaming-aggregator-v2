/**
 * The preset pool and the four-slot selection (recommendation
 * 2026-09-08-002 §2.3–2.4).
 *
 * A preset is an **intent**, not a filter: something a person would say out
 * loud. That is the test the pool is held to — if it cannot be said, it is a
 * filter and belongs in the sheet. Each entry therefore carries a
 * `sentence` (what the user would say, also the rotating placeholder), a
 * `phrase` (the richer text handed to vector search when `search_semantic`
 * is on) and a `filters` patch (the deterministic fallback when it is off).
 *
 * Nothing here may need a bespoke code path. The moment a card needs its own
 * fetcher it has stopped being an intent and will not port to the
 * conversational surface the presets are the on-ramp for (§2.5).
 *
 * Why the shared tree: this is pure, and the acceptance list wants
 * `selectPresets` under test. The root vitest suite covers only `src/`,
 * `scripts/` and `workers/`; native has no runner. `native/src/components/
 * BrowsePresearch.tsx` adds the icons, which are the only part that cannot
 * live here.
 */

import type { BrowseFilters } from './browseFilters';
import { getContextualTimeBucket } from '../recommendations-v2/weights';

/** Milliseconds in a week — the rotation seed, as `genreSpotlight` uses it. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Vibe cards say how you want to feel; constraint cards say what the
 * evening allows. The split is what makes them compose: the four
 * constraints are orthogonal to the four vibes, so "Comfort" + "Free to
 * watch" is one real Sunday intent expressed in two taps.
 */
export type PresetKind = 'vibe' | 'constraint';

/** Which of the four slots a card was chosen for. Stamped onto the log row. */
export type PresetSlot = 'A' | 'B' | 'C' | 'D';

/**
 * Why this card is on screen. Logged with every tap (§6) so the selection
 * logic can be judged rather than assumed: if `taste` slots are tapped no
 * more often than `rotation` slots, the affinity mapping is not earning its
 * keep and should be replaced by the user's own tap history.
 */
export type PresetSelectionReason = 'time' | 'taste' | 'fixed' | 'rotation';

export interface Preset {
  key: string;
  label: string;
  /** Two- or three-word card subtitle. */
  sub: string;
  /** Icon name — resolved to a component by the native card. */
  icon: string;
  /** Accent hue, as a hex string. */
  hue: string;
  kind: PresetKind;
  /** What a person would say. Also the rotating search placeholder (§8.2). */
  sentence: string;
  /**
   * Sent to vector search when `search_semantic` is on. Null for a card
   * that is purely a constraint: "free" is not a feeling, and embedding it
   * would return titles *about* money. A null-phrase card keeps whatever
   * phrase is already active and only merges its filters (§2.3).
   */
  phrase: string | null;
  /** The deterministic fallback, merged onto the live filters (§2.3). */
  filters: Partial<BrowseFilters>;
  /**
   * Taste-cluster ids this vibe serves, for slot B. Empty on constraint
   * cards — a constraint is about the evening, not about taste.
   */
  clusters: string[];
}

export interface SelectedPreset extends Preset {
  slot: PresetSlot;
  selectionReason: PresetSelectionReason;
}

const HUE = {
  teal: '#0d9488',
  amber: '#d97706',
  violet: '#7c3aed',
  rose: '#be185d',
  blue: '#2563eb',
  green: '#16a34a',
} as const;

/**
 * The pool of eight. The four vibe cards are the ones that shipped with
 * Browse and are unchanged — they are good. The four constraint cards are
 * the four constraint classes the mood-room labels and the motivating
 * sentence surface: recency + quality, cost, commitment, audience.
 */
export const PRESET_POOL: Preset[] = [
  // ── Vibe (unchanged from the original four) ──────────────────────
  {
    key: 'slow',
    label: 'Slow burn',
    sub: 'Long & absorbing',
    icon: 'leaf',
    hue: HUE.teal,
    kind: 'vibe',
    sentence: 'something long and absorbing I can sink into',
    phrase:
      'an understated, meditative drama that unfolds gradually and rewards your attention — thoughtful, restrained, character-driven and emotionally rich',
    filters: { genres: ['Drama'], runtime: 'over_120' },
    clusters: ['heartfelt-drama', 'prestige-award-winners', 'cult-indie'],
  },
  {
    key: 'quick',
    label: 'High-energy',
    sub: 'Fast & thrilling',
    icon: 'zap',
    hue: HUE.amber,
    kind: 'vibe',
    sentence: "something fast and fun where I don't have to think",
    phrase:
      'an exciting, high-energy crowd-pleaser — thrilling, entertaining and effortless to enjoy, an adrenaline-fuelled popcorn film',
    filters: { genres: ['Action', 'Comedy'] },
    clusters: ['action-adrenaline', 'epic-scifi-fantasy'],
  },
  {
    key: 'late',
    label: 'Late-night',
    sub: 'Strange & dark',
    icon: 'moon',
    hue: HUE.violet,
    kind: 'vibe',
    sentence: 'something dark and strange for late at night',
    phrase:
      'an eerie, unsettling and atmospheric horror or thriller — creepy, ominous, mysterious, tense and haunting',
    filters: { genres: ['Horror', 'Mystery', 'Thriller'] },
    clusters: ['horror-supernatural', 'dark-thrillers', 'mind-bending-mysteries'],
  },
  {
    key: 'comfort',
    label: 'Comfort',
    sub: 'Easy & warm',
    icon: 'heart',
    hue: HUE.rose,
    kind: 'vibe',
    sentence: 'something easy and warm I can half-watch',
    phrase:
      'a heartwarming, gentle and uplifting film — sweet, charming, tender and reassuring, an easy and soothing watch',
    filters: { genres: ['Comedy', 'Romance', 'Family'] },
    clusters: ['feel-good-funny', 'rom-coms-love-stories', 'family-kids'],
  },

  // ── Constraint (new) ─────────────────────────────────────────────
  {
    key: 'new-good',
    label: 'New & actually good',
    sub: 'Recent, well rated',
    icon: 'sparkles',
    hue: HUE.amber,
    kind: 'constraint',
    sentence: "something recent that isn't rubbish",
    // Filter-only, for the same reason `free` is (below): "new and actually
    // good" is a pair of METADATA PREDICATES, not a feeling, and there is
    // nothing here for an embedding to find.
    //
    // It shipped with a phrase — "a recent, well-reviewed film or series from
    // the last year that both critics and audiences rated highly" — and that
    // phrase is a statement ABOUT a title rather than a description OF one.
    // No synopsis reads like it, so nearest-neighbour retrieval landed on
    // titles whose overviews use the vocabulary of acclaim. Measured
    // 2026-09-09, its top five were *Voir* (a documentary series in which
    // "film lovers examine the cinematic moments that thrilled" them), *The
    // Favourite*, *The Great*, *Blockbuster*, and *Nightcrawler* (crime
    // journalism). Not one is recent; not one was chosen for being
    // well-reviewed. The card asked for well-reviewed things and retrieved
    // programmes about reviewing.
    //
    // Post-filtering that neighbourhood by recency and rating then left TWO
    // titles on a device, out of 363 in the catalogue that meet the card's
    // own criteria. With no phrase the tap composes filters only and resolves
    // down /discover, where both predicates are applied server-side across
    // the whole catalogue instead of across 150 embedding neighbours.
    //
    // The vote floor §2.3 asks for is implicit and already correct: every
    // path that honours `minRating` pairs it with a vote_count floor (50 on
    // /discover, 20 on the semantic quality gate), so a 9.0 with twelve
    // votes cannot qualify. No new axis needed for it.
    phrase: null,
    filters: { released: 'last_12_months', minRating: 7 },
    clusters: [],
  },
  {
    key: 'free',
    label: 'Free to watch',
    sub: 'On what you pay for',
    icon: 'check',
    hue: HUE.green,
    kind: 'constraint',
    sentence: "something I don't have to pay for",
    // Filter-only on purpose. "Free" is a fact about availability, not a
    // feeling, and there is nothing for an embedding to find. Tapping it
    // keeps whatever phrase is active and adds the cost constraint (§2.3).
    phrase: null,
    filters: { cost: 'free' },
    clusters: [],
  },
  {
    key: 'finish-tonight',
    label: 'Finish it tonight',
    sub: 'Under two hours',
    icon: 'clock',
    hue: HUE.blue,
    kind: 'constraint',
    sentence: 'a film I can actually finish tonight',
    phrase: 'a tight, satisfying, self-contained film under two hours',
    filters: { contentType: 'movie', runtime: '60_120' },
    clusters: [],
  },
  {
    key: 'family',
    label: 'Whole family',
    sub: 'Everyone can watch',
    icon: 'users',
    hue: HUE.teal,
    kind: 'constraint',
    sentence: 'something we can all watch together',
    phrase:
      'a warm, funny family film or series that adults enjoy as much as children — nothing frightening or adult',
    filters: { genres: ['Family', 'Animation', 'Adventure'] },
    clusters: [],
  },
];

/** Pool order, by key, for the two rotations below. */
const VIBE_KEYS = PRESET_POOL.filter((p) => p.kind === 'vibe').map((p) => p.key);

/** Every sentence, in pool order — the rotating search placeholder (§8.2). */
export const PRESET_SENTENCES: string[] = PRESET_POOL.map((p) => p.sentence);

export function presetByKey(key: string): Preset | undefined {
  return PRESET_POOL.find((p) => p.key === key);
}

/** The weekly rotation seed. Same derivation `genreSpotlight` uses. */
export function weekBucketFor(now: number = Date.now()): number {
  return Math.floor(now / WEEK_MS);
}

export interface SelectPresetsInput {
  /** Local hour, 0–23. */
  hour: number;
  /** Local day of week, 0 = Sunday. */
  dow: number;
  /** The user's onboarding cluster picks. Empty for a cold user. */
  selectedClusters: readonly string[];
  /** {@link weekBucketFor}. Injected so the rotation is testable. */
  weekBucket: number;
}

/**
 * Choose the four cards to show.
 *
 * Runs entirely from data the app already holds — the clock and the profile
 * clusters. No taste-vector similarity, no mood-room RPC, no server round
 * trip, and nothing new persisted (§2.4). The slots:
 *
 *   A  vibe, by time of day     — the card and the ranking agree, because
 *                                 both read `getContextualTimeBucket`.
 *   B  vibe, by taste affinity  — highest-affinity vibe that is not A,
 *                                 rotating weekly so it is not the same one
 *                                 every week.
 *   C  constraint, fixed        — "New & actually good". The thesis of the
 *                                 brief and the most universal intent.
 *   D  constraint, by time      — cost on weekdays, audience at the weekend,
 *                                 commitment late on a weeknight.
 *
 * Once search logs exist the natural upgrade is to reorder by the user's own
 * preset-tap history, which §5 already captures via `metadata.mood_key`.
 */
export function selectPresets(input: SelectPresetsInput): SelectedPreset[] {
  const { hour, dow, selectedClusters, weekBucket } = input;

  const slotA = pickContextualVibe(hour, dow);
  const thisWeek = pickTasteVibe(selectedClusters, slotA, weekBucket);
  // "Not the same as last week" without storing anything: ask the same
  // question of the previous week's seed. Rotation already guarantees a
  // different answer whenever there is more than one candidate, but running
  // it explicitly is what makes the property testable rather than incidental.
  const lastWeek = pickTasteVibe(selectedClusters, slotA, weekBucket - 1);
  const slotB =
    thisWeek.key === lastWeek.key
      ? pickTasteVibe(selectedClusters, slotA, weekBucket + 1)
      : thisWeek;

  const slotD = pickContextualConstraint(hour, dow);

  return [
    stamp(slotA, 'A', 'time'),
    stamp(slotB.key, 'B', slotB.fromTaste ? 'taste' : 'rotation'),
    stamp('new-good', 'C', 'fixed'),
    stamp(slotD, 'D', 'time'),
  ];
}

// ── Slot rules ─────────────────────────────────────────────────────

/**
 * Slot A. `getContextualTimeBucket` answers two of the four cases directly;
 * weekend evening is a third the pipeline has no bucket for, so it is
 * derived here rather than added to the scoring vocabulary — a card is not
 * a ranking signal.
 */
function pickContextualVibe(hour: number, dow: number): string {
  const bucket = getContextualTimeBucket(hour, dow);
  if (bucket === 'late_night') return 'late';
  if (bucket === 'weekday_morning') return 'comfort';
  const isWeekend = dow === 0 || dow === 6;
  if (isWeekend && hour >= 17) return 'quick';
  return 'slow';
}

/**
 * Slot D. Most specific rule first, so a Friday at 22:00 reads as a
 * weeknight ("can I finish it?") rather than as the weekend.
 */
function pickContextualConstraint(hour: number, dow: number): string {
  const isWeekday = dow >= 1 && dow <= 5;
  if (isWeekday && hour >= 21) return 'finish-tonight';
  // Fri–Sun before the evening is when "can we all watch this" is asked.
  const isWeekendish = dow === 5 || dow === 6 || dow === 0;
  if (isWeekendish && hour < 21) return 'family';
  return 'free';
}

/**
 * Slot B. Vibes whose clusters the user actually picked come first, ordered
 * by how many they hit; everything else falls back to pool order. The weekly
 * seed rotates *within* the chosen band, so a user with one clear affinity
 * keeps getting a card they like rather than being rotated off it.
 */
function pickTasteVibe(
  selectedClusters: readonly string[],
  exclude: string,
  weekBucket: number,
): { key: string; fromTaste: boolean } {
  const picks = new Set(selectedClusters);
  const eligible = VIBE_KEYS.filter((k) => k !== exclude);

  const scored = eligible.map((key) => {
    const preset = presetByKey(key);
    const affinity = preset ? preset.clusters.filter((c) => picks.has(c)).length : 0;
    return { key, affinity };
  });

  const hits = scored.filter((s) => s.affinity > 0).sort((a, b) => b.affinity - a.affinity);
  const band = hits.length > 0 ? hits : scored;
  const index = ((weekBucket % band.length) + band.length) % band.length;
  return { key: band[index].key, fromTaste: hits.length > 0 };
}

function stamp(key: string, slot: PresetSlot, selectionReason: PresetSelectionReason): SelectedPreset {
  const preset = presetByKey(key);
  // Unreachable via the rules above — every key they can return is in the
  // pool — but a missing card must not blank the grid.
  if (!preset) return { ...PRESET_POOL[0], slot, selectionReason };
  return { ...preset, slot, selectionReason };
}
