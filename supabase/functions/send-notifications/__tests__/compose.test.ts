// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { SHARE_SERVICE_LABELS } from '../../../../src/lib/growth/serviceLabels';
import { composeMessage, SERVICE_LABELS, type ClaimedCandidate } from '../compose';

const arrival = (n: number, over: Partial<ClaimedCandidate> = {}): ClaimedCandidate => ({
  type: 'arrival',
  tmdb_id: 95396 + n,
  media_type: 'tv',
  service_id: 'apple',
  title: n === 0 ? 'Severance' : `Title ${n}`,
  delivery_id: `00000000-0000-4000-8000-00000000000${n}`,
  ...over,
});

const leaving = (n: number, over: Partial<ClaimedCandidate> = {}): ClaimedCandidate => ({
  ...arrival(n),
  type: 'leaving_soon',
  service_id: 'netflix',
  expires_on: '2026-09-19T00:00:00+00:00',
  ...over,
});

describe('composeMessage', () => {
  it('single arrival carries its delivery row, service and via', () => {
    const msg = composeMessage([arrival(0)]);
    expect(msg.title).toBe('Severance is now streaming');
    expect(msg.data).toEqual({
      url: 'videx://detail/tv-95396',
      type: 'arrival',
      delivery_id: '00000000-0000-4000-8000-000000000000',
      via: 'push',
      service_id: 'apple',
    });
  });

  it('single leaving-soon adds expires_on', () => {
    const msg = composeMessage([leaving(0)]);
    expect(msg.title).toBe('Severance is leaving soon');
    expect(msg.data).toEqual({
      url: 'videx://detail/tv-95396',
      type: 'leaving_soon',
      delivery_id: '00000000-0000-4000-8000-000000000000',
      via: 'push',
      service_id: 'netflix',
      expires_on: '2026-09-19T00:00:00+00:00',
    });
  });

  it('an arrival never carries expires_on', () => {
    expect(composeMessage([arrival(0, { expires_on: '2026-09-19' })]).data).not.toHaveProperty('expires_on');
  });

  it('a bundle has a null delivery id and no title fields', () => {
    const msg = composeMessage([arrival(0), arrival(1), leaving(2)]);
    expect(msg.title).toBe('Severance and 1 more just landed');
    expect(msg.data).toEqual({ url: 'videx://watchlist', type: 'bundle', delivery_id: null, via: 'push' });
  });

  it('a leaving-soon bundle is the same shape', () => {
    const msg = composeMessage([leaving(0), leaving(1)]);
    expect(msg.title).toBe('Severance and 1 more are leaving soon');
    expect(msg.data).toEqual({ url: 'videx://watchlist', type: 'bundle', delivery_id: null, via: 'push' });
  });

  it('one arrival leads over leaving-soon titles and stays single-title', () => {
    const msg = composeMessage([leaving(1), arrival(0)]);
    expect(msg.data.type).toBe('arrival');
    expect(msg.data.delivery_id).toBe('00000000-0000-4000-8000-000000000000');
  });
});

describe('push copy', () => {
  it('single arrival', () => {
    expect(composeMessage([arrival(0)])).toMatchObject({
      title: 'Severance is now streaming',
      body: 'Now on Apple TV+, from your watchlist.',
    });
  });

  it('single leaving-soon', () => {
    expect(composeMessage([leaving(0)])).toMatchObject({
      title: 'Severance is leaving soon',
      body: 'Leaving Netflix within a week. Watch it before it goes.',
    });
  });

  it('arrival bundle', () => {
    expect(composeMessage([arrival(0), arrival(1)])).toMatchObject({
      title: 'Severance and 1 more just landed',
      body: 'New on your subscriptions. Open Videx to watch.',
    });
  });

  it('leaving-soon bundle', () => {
    expect(composeMessage([leaving(0), leaving(1), leaving(2)])).toMatchObject({
      title: 'Severance and 2 more are leaving soon',
      body: 'Watchlist titles are expiring within a week.',
    });
  });

  it('no template uses an em or en dash (tone guide)', () => {
    const all = [
      composeMessage([arrival(0)]),
      composeMessage([leaving(0)]),
      composeMessage([arrival(0), arrival(1)]),
      composeMessage([leaving(0), leaving(1)]),
    ];
    for (const m of all) expect(`${m.title} ${m.body}`).not.toMatch(/[–—]/);
  });
});

describe('SERVICE_LABELS (IN-GR-025)', () => {
  // The Deno function keeps its own copy because it cannot import src/lib;
  // this keeps the push and the share copy naming services the same way.
  it('matches SHARE_SERVICE_LABELS key for key', () => {
    expect(SERVICE_LABELS).toEqual(SHARE_SERVICE_LABELS);
  });
});
