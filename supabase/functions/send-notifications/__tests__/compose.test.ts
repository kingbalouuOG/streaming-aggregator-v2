// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { composeMessage, type ClaimedCandidate } from '../compose';

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
