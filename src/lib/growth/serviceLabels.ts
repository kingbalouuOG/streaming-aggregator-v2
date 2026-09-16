/**
 * service_id → the label shared copy uses (Growth S4).
 *
 * One map for the Worker's title page ("Stream now on …") and the app's
 * share sheet and "Tell someone" copy, so a shared message and the page it
 * opens always name a service the same way. Moved here from
 * workers/api/src/titlePage.ts, which re-exports it.
 *
 * Pure, imported by the Worker and native.
 */

export const SHARE_SERVICE_LABELS: Record<string, string> = {
  netflix: 'Netflix', prime: 'Prime Video', disney: 'Disney+', apple: 'Apple TV+',
  now: 'NOW', paramount: 'Paramount+', itvx: 'ITVX', channel4: 'Channel 4',
  hbo: 'HBO Max', discovery: 'Discovery+', crunchyroll: 'Crunchyroll',
  mubi: 'MUBI', plutotv: 'Pluto TV',
  bbc: 'BBC iPlayer', skygo: 'Sky Go',
};

/** The label for a service id; an unknown id is returned as given. */
export function shareServiceLabel(serviceId: string): string {
  return SHARE_SERVICE_LABELS[serviceId] ?? serviceId;
}
