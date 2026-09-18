/**
 * send-notifications copy and payload (H0 Stream B; payload fields Growth S4).
 *
 * Pure: no Deno, Supabase or network APIs, so the root vitest rig tests it
 * (supabase/functions/send-notifications/__tests__/compose.test.ts) and
 * index.ts imports it.
 *
 * The push `data` the app reads on tap (native/src/providers/notifications.tsx):
 *   url          videx://detail/{type}-{id} for one title, videx://watchlist for a bundle
 *   type         'arrival' | 'leaving_soon' | 'bundle'
 *   delivery_id  the claimed notification_deliveries row for one title; null for a
 *                bundle (it covers several rows). Lands on growth_events.delivery_id
 *                when the push is opened, which is how push CTR is measured.
 *   via          'push', the URL channel (plan D13)
 *   service_id   one title only: the service it landed on or is leaving
 *   expires_on   leaving-soon only: streaming_availability.expires_on
 * service_id and expires_on feed the app's "Tell someone" copy.
 */

export type NotificationType = 'arrival' | 'leaving_soon';

export interface Candidate {
  type: NotificationType;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  service_id: string;
  title: string;
  /** Leaving-soon only. */
  expires_on?: string | null;
}

/** A candidate whose notification_deliveries row this run claimed. */
export interface ClaimedCandidate extends Candidate {
  delivery_id: string;
}

export interface PushData {
  url: string;
  type: NotificationType | 'bundle';
  delivery_id: string | null;
  via: 'push';
  service_id?: string;
  expires_on?: string;
}

export interface ComposedMessage {
  title: string;
  body: string;
  data: PushData;
}

// Content-id format shared with the client router: `${mediaType}-${tmdbId}`
// ("movie-12345" / "tv-12345"). Deep link → videx://detail/<contentId>.
const contentId = (mediaType: string, tmdbId: number) => `${mediaType}-${tmdbId}`;
export const detailUrl = (mediaType: string, tmdbId: number) =>
  `videx://detail/${contentId(mediaType, tmdbId)}`;
export const watchlistUrl = () => `videx://watchlist`;

// ── Service-name display map (for copy) ──────────────────
// A local copy of src/lib/growth/serviceLabels.ts SHARE_SERVICE_LABELS: this
// Deno function cannot import src/lib. __tests__/compose.test.ts asserts the
// two maps match key for key, so a rename on one side fails CI (IN-GR-025).
export const SERVICE_LABELS: Record<string, string> = {
  netflix: 'Netflix', prime: 'Prime Video', disney: 'Disney+', apple: 'Apple TV+',
  now: 'NOW', paramount: 'Paramount+', itvx: 'ITVX', channel4: 'Channel 4',
  hbo: 'HBO Max', discovery: 'Discovery+', crunchyroll: 'Crunchyroll',
  mubi: 'MUBI', plutotv: 'Pluto TV',
  bbc: 'BBC iPlayer', skygo: 'Sky Go',
};
export const serviceLabel = (id: string) => SERVICE_LABELS[id] ?? id;

function singleTitleData(c: ClaimedCandidate): PushData {
  const data: PushData = {
    url: detailUrl(c.media_type, c.tmdb_id),
    type: c.type,
    delivery_id: c.delivery_id,
    via: 'push',
    service_id: c.service_id,
  };
  if (c.type === 'leaving_soon' && c.expires_on) data.expires_on = c.expires_on;
  return data;
}

const bundleData = (): PushData => ({
  url: watchlistUrl(),
  type: 'bundle',
  delivery_id: null,
  via: 'push',
});

// ── Copy composition (one push, bundled) ─────────────────
export function composeMessage(cands: ClaimedCandidate[]): ComposedMessage {
  // Lead with arrivals (retention loop). Only fall to leaving-soon if there
  // are no arrivals — keeps the daily push positive-first.
  const arrivals = cands.filter((c) => c.type === 'arrival');
  const leaving = cands.filter((c) => c.type === 'leaving_soon');
  const lead = arrivals.length > 0 ? arrivals : leaving;
  const isArrival = arrivals.length > 0;
  const first = lead[0];
  const extra = lead.length - 1;
  const data = lead.length === 1 ? singleTitleData(first) : bundleData();

  if (isArrival) {
    const title =
      lead.length === 1
        ? `${first.title} is now streaming`
        : `${first.title} and ${extra} more just landed`;
    const body =
      lead.length === 1
        ? `Now on ${serviceLabel(first.service_id)}, from your watchlist.`
        : `New on your subscriptions. Open Videx to watch.`;
    return { title, body, data };
  }

  const title =
    lead.length === 1
      ? `${first.title} is leaving soon`
      : `${first.title} and ${extra} more are leaving soon`;
  const body =
    lead.length === 1
      ? `Leaving ${serviceLabel(first.service_id)} within a week. Watch it before it goes.`
      : `Watchlist titles are expiring within a week.`;
  return { title, body, data };
}
