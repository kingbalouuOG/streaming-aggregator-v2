/**
 * Recommendations V2 — Recency Scoring
 *
 * Two scoring functions, one per surface:
 *
 * Home (piecewise linear): rewards titles that are "new to the user" — either
 * newly released or recently added to their services. Matches the 30-day and
 * 90-day windows used in the Home row definitions.
 *
 * For You (exponential decay): smoother curve suited to the continuous
 * Catalogue-age slider range. Standard in recommendation literature.
 * Half-life default = 180 days. The slider modulates the *weight* of this
 * score in Stage 2, not the decay function itself.
 */

/**
 * Home surface recency score (piecewise linear).
 *
 * Date anchor: MAX(release_date, available_since) — "new to the user"
 * includes both new releases and catalogue additions.
 *
 * Breakpoints per brief §3.3:
 *   0–30 days:   1.0
 *   30–90 days:  linear decay 1.0 → 0.5
 *   90–365 days: linear decay 0.5 → 0.1
 *   365+ days:   floor at 0.1
 */
export function computeHomeRecencyScore(
  releaseDate: string | null,
  availableSince?: string | null,
): number {
  const anchorDate = pickDateAnchor(releaseDate, availableSince);
  if (!anchorDate) return 0.5; // neutral for unknown dates

  const daysSince = daysBetween(anchorDate, new Date());
  if (daysSince < 0) return 1.0; // future release — max recency

  if (daysSince <= 30) return 1.0;
  if (daysSince <= 90) return lerp(1.0, 0.5, (daysSince - 30) / 60);
  if (daysSince <= 365) return lerp(0.5, 0.1, (daysSince - 90) / 275);
  return 0.1;
}

/**
 * For You surface recency score (exponential decay).
 *
 * Date anchor: release_date — "how fresh is this content in the world."
 *
 * Formula: score = exp(-0.693 × days / halfLife)
 *   At halfLife days: score ≈ 0.5
 *   At 2× halfLife:  score ≈ 0.25
 *   At 4× halfLife:  score ≈ 0.06
 *
 * Default halfLife = 180 days per brief §3.3.
 */
export function computeForYouRecencyScore(
  releaseDate: string | null,
  halfLifeDays: number = 180,
): number {
  if (!releaseDate) return 0.5; // neutral for unknown dates

  const parsed = new Date(releaseDate);
  if (isNaN(parsed.getTime())) return 0.5;

  const daysSince = daysBetween(parsed, new Date());
  if (daysSince < 0) return 1.0; // future release

  return Math.exp(-0.693 * daysSince / halfLifeDays);
}

// ── Helpers ──

/** Pick the more recent of two dates (MAX). Returns null if both are null. */
function pickDateAnchor(
  releaseDate: string | null,
  availableSince?: string | null,
): Date | null {
  const dates: Date[] = [];

  if (releaseDate) {
    const d = new Date(releaseDate);
    if (!isNaN(d.getTime())) dates.push(d);
  }
  if (availableSince) {
    const d = new Date(availableSince);
    if (!isNaN(d.getTime())) dates.push(d);
  }

  if (dates.length === 0) return null;
  if (dates.length === 1) return dates[0];
  return dates[0] > dates[1] ? dates[0] : dates[1];
}

/** Days between two dates (can be negative if `from` is after `to`). */
function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

/** Linear interpolation between a and b. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
