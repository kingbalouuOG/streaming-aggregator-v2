// Mirror of src/lib/recommendations-v2/recency.ts — IN-466 / ADR-011.
// Pure module; bit-for-bit copy. Drift enforced by shared-tree-drift CI.

export function computeHomeRecencyScore(
  releaseDate: string | null,
  availableSince?: string | null,
): number {
  const anchorDate = pickDateAnchor(releaseDate, availableSince);
  if (!anchorDate) return 0.5;

  const daysSince = daysBetween(anchorDate, new Date());
  if (daysSince < 0) return 1.0;

  if (daysSince <= 30) return 1.0;
  if (daysSince <= 90) return lerp(1.0, 0.5, (daysSince - 30) / 60);
  if (daysSince <= 365) return lerp(0.5, 0.1, (daysSince - 90) / 275);
  return 0.1;
}

export function computeForYouRecencyScore(
  releaseDate: string | null,
  halfLifeDays: number = 180,
): number {
  if (!releaseDate) return 0.5;
  const parsed = new Date(releaseDate);
  if (isNaN(parsed.getTime())) return 0.5;
  const daysSince = daysBetween(parsed, new Date());
  if (daysSince < 0) return 1.0;
  return Math.exp(-0.693 * daysSince / halfLifeDays);
}

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

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
