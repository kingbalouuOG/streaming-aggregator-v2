/**
 * Share sheet copy (Growth S4, plan G1-1 and G1-3).
 *
 * The UK availability line is the hook: a shared title says where it
 * streams before anyone taps the link. Service names come from the same map
 * as the Worker's title page (serviceLabels.ts), so the message and the page
 * it opens agree.
 *
 *   subscription or free: "Severance (2022). On Apple TV+ in the UK."
 *   rent or buy only:     "Severance (2022). Rent or buy on Apple TV+ and Prime Video in the UK."
 *   nothing in the UK:    "Severance (2022). See where to watch in the UK on Videx."
 *   room:                 "More like Heat: 24 titles picked for the mood."
 *
 * A share made from the "Tell someone" moment (a push tap that opened this
 * title) leads with the moment: "Just landed on Apple TV+: Severance (2022). …"
 *
 * Tone guide: no exclamation marks, no em dashes, never the word AI.
 * Pure: no React Native imports, so it runs under the root vitest rig.
 */

import type { SrcOrigin } from './inboundLink';
import { neutraliseRoomLabel } from './roomSnapshot';
import { shareServiceLabel } from './serviceLabels';

/** Two or three names read in full; four or more collapse after two. */
export function joinServiceLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length >= 4) return `${labels[0]}, ${labels[1]} and ${labels.length - 2} more`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

// Channel tokens ("prime:hayu") are add-on channels sold inside a service,
// not the service itself (migration 084); they never name a service here.
function labelsFor(serviceIds: readonly string[], exclude: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  for (const id of serviceIds) {
    if (!id || id.includes(':')) continue;
    const label = shareServiceLabel(id);
    if (exclude.has(label) || out.includes(label)) continue;
    out.push(label);
  }
  return out;
}

export interface ShareCopy {
  message: string;
  url: string;
}

export interface TitleShareInput {
  title: string;
  year?: number | null;
  /** Service ids streaming it on a subscription or free tier. */
  subscriptionServices: readonly string[];
  /** Service ids renting or selling it. */
  rentBuyServices: readonly string[];
  /** The attributed share URL (withShareAttribution). */
  url: string;
  /** The "Tell someone" lead, e.g. "Just landed on Apple TV+". */
  momentLine?: string | null;
}

function titleWithYear(title: string, year?: number | null): string {
  const name = title.trim();
  if (year && Number.isInteger(year) && year > 0) return `${name} (${year}).`;
  return /[.?!]$/.test(name) ? name : `${name}.`;
}

export function buildTitleShareCopy(input: TitleShareInput): ShareCopy {
  const streaming = labelsFor(input.subscriptionServices);
  const rentBuy = labelsFor(input.rentBuyServices, new Set(streaming));
  const line =
    streaming.length > 0
      ? `On ${joinServiceLabels(streaming)} in the UK.`
      : rentBuy.length > 0
        ? `Rent or buy on ${joinServiceLabels(rentBuy)} in the UK.`
        : 'See where to watch in the UK on Videx.';
  const lead = input.momentLine ? `${input.momentLine}: ` : '';
  return {
    message: `${lead}${titleWithYear(input.title, input.year)} ${line}\n${input.url}`,
    url: input.url,
  };
}

export interface RoomShareInput {
  label: string;
  count: number;
  url: string;
}

export function buildRoomShareCopy(input: RoomShareInput): ShareCopy {
  const noun = input.count === 1 ? 'title' : 'titles';
  return {
    message: `${neutraliseRoomLabel(input.label)}: ${input.count} ${noun} picked for the mood.\n${input.url}`,
    url: input.url,
  };
}

/**
 * The canonical URL plus ?via=share, and &src=push when the share started in
 * a session a push tap opened. The canonical URL itself never changes.
 */
export function withShareAttribution(url: string, src: SrcOrigin): string {
  const query = src === 'push' ? 'via=share&src=push' : 'via=share';
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

/** RN Share.share content: iOS takes the link in its own field as well. */
export function shareSheetContent(
  copy: ShareCopy,
  os: string,
): { message: string; url?: string } {
  return os === 'ios' ? { message: copy.message, url: copy.url } : { message: copy.message };
}

// ── "Tell someone" (a push tap that opened this title) ──────────────────

export type ShareMomentType = 'arrival' | 'leaving_soon';

export interface ShareMoment {
  type: ShareMomentType;
  serviceId: string;
  /** streaming_availability.expires_on, leaving-soon only. */
  expiresOn?: string | null;
}

export interface MomentCopy {
  /** The banner under the hero title. */
  banner: string;
  /** Leads the share message. */
  line: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "Friday 19 September". The day of week alone is ambiguous a week out, and
 * UTC matches formatPickedDate (Hermes has no reliable locale data).
 */
export function formatLeavingDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function buildMomentCopy(moment: ShareMoment, title: string): MomentCopy | null {
  if (!moment.serviceId || moment.serviceId.includes(':')) return null;
  const service = shareServiceLabel(moment.serviceId);
  const name = title.trim();
  if (moment.type === 'arrival') {
    return {
      banner: `${name} has just landed on ${service}. Tell someone.`,
      line: `Just landed on ${service}`,
    };
  }
  if (moment.type === 'leaving_soon') {
    const date = formatLeavingDate(moment.expiresOn);
    const when = date ? `on ${date}` : 'soon';
    return {
      banner: `${name} leaves ${service} ${when}. Tell someone.`,
      line: `Leaving ${service} ${when}`,
    };
  }
  return null;
}
