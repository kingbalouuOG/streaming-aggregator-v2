import { describe, expect, it } from 'vitest';

import {
  buildMomentCopy,
  buildRoomShareCopy,
  buildTitleShareCopy,
  formatLeavingDate,
  joinServiceLabels,
  shareSheetContent,
  withShareAttribution,
} from '../shareCopy';
import { SHARE_SERVICE_LABELS } from '../serviceLabels';
import { SHARE_SERVICE_LABELS as WORKER_LABELS } from '../../../../workers/api/src/titlePage';

const URL = 'https://videxstreaming.com/t/tv/95396-severance-2022?via=share';

describe('joinServiceLabels', () => {
  it.each([
    [[], ''],
    [['Netflix'], 'Netflix'],
    [['Netflix', 'NOW'], 'Netflix and NOW'],
    [['Netflix', 'NOW', 'MUBI'], 'Netflix, NOW and MUBI'],
    [['Netflix', 'NOW', 'MUBI', 'ITVX'], 'Netflix, NOW and 2 more'],
    [['Netflix', 'NOW', 'MUBI', 'ITVX', 'Sky Go'], 'Netflix, NOW and 3 more'],
  ])('%j -> %s', (labels, out) => {
    expect(joinServiceLabels(labels)).toBe(out);
  });
});

describe('buildTitleShareCopy', () => {
  it('leads with the subscription services', () => {
    const copy = buildTitleShareCopy({
      title: 'Severance',
      year: 2022,
      subscriptionServices: ['apple'],
      rentBuyServices: ['prime'],
      url: URL,
    });
    expect(copy).toEqual({ message: `Severance (2022). On Apple TV+ in the UK.\n${URL}`, url: URL });
  });

  it('uses the rent or buy line when nothing streams', () => {
    const copy = buildTitleShareCopy({
      title: 'Severance',
      year: 2022,
      subscriptionServices: [],
      rentBuyServices: ['apple', 'prime'],
      url: URL,
    });
    expect(copy.message).toBe(`Severance (2022). Rent or buy on Apple TV+ and Prime Video in the UK.\n${URL}`);
  });

  it('still shares a title with nothing in the UK', () => {
    const copy = buildTitleShareCopy({
      title: 'Severance',
      year: 2022,
      subscriptionServices: [],
      rentBuyServices: [],
      url: URL,
    });
    expect(copy.message).toBe(`Severance (2022). See where to watch in the UK on Videx.\n${URL}`);
  });

  it('ignores add-on channel tokens', () => {
    const copy = buildTitleShareCopy({
      title: 'Severance',
      year: 2022,
      subscriptionServices: ['prime:hayu'],
      rentBuyServices: ['now:cinema'],
      url: URL,
    });
    expect(copy.message).toContain('See where to watch in the UK on Videx.');
  });

  it('drops rent or buy services already streaming and duplicates', () => {
    const copy = buildTitleShareCopy({
      title: 'Heat',
      year: 1995,
      subscriptionServices: ['netflix', 'netflix', 'now', 'mubi', 'itvx'],
      rentBuyServices: ['netflix'],
      url: URL,
    });
    expect(copy.message).toBe(`Heat (1995). On Netflix, NOW and 2 more in the UK.\n${URL}`);
  });

  it('handles a missing year and a title ending in punctuation', () => {
    const base = { subscriptionServices: ['netflix'], rentBuyServices: [], url: URL };
    expect(buildTitleShareCopy({ ...base, title: 'Heat' }).message).toMatch(/^Heat\. On Netflix/);
    expect(buildTitleShareCopy({ ...base, title: "What's Up, Doc?", year: null }).message).toMatch(
      /^What's Up, Doc\? On Netflix/,
    );
  });

  it('leads with the moment line', () => {
    const copy = buildTitleShareCopy({
      title: 'Severance',
      year: 2022,
      subscriptionServices: ['apple'],
      rentBuyServices: [],
      url: URL,
      momentLine: 'Just landed on Apple TV+',
    });
    expect(copy.message).toBe(`Just landed on Apple TV+: Severance (2022). On Apple TV+ in the UK.\n${URL}`);
  });

  it('keeps to the tone guide', () => {
    const copy = buildTitleShareCopy({
      title: 'Severance',
      year: 2022,
      subscriptionServices: [],
      rentBuyServices: [],
      url: URL,
    });
    expect(copy.message).not.toMatch(/!|—|\bAI\b/);
  });
});

describe('buildRoomShareCopy', () => {
  const roomUrl = 'https://videxstreaming.com/room/3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b?via=share';

  it('names the room and its size', () => {
    expect(buildRoomShareCopy({ label: 'Slow-burn crime sagas', count: 24, url: roomUrl })).toEqual({
      message: `Slow-burn crime sagas: 24 titles picked for the mood.\n${roomUrl}`,
      url: roomUrl,
    });
  });

  it('strips personal framing and singularises', () => {
    expect(buildRoomShareCopy({ label: 'If you love Heat', count: 1, url: roomUrl }).message).toBe(
      `More like Heat: 1 title picked for the mood.\n${roomUrl}`,
    );
  });
});

describe('withShareAttribution', () => {
  const canonical = 'https://videxstreaming.com/t/tv/95396-severance-2022';
  it('adds via=share for an organic session', () => {
    expect(withShareAttribution(canonical, 'organic')).toBe(`${canonical}?via=share`);
  });
  it('adds src=push for a push-originated session', () => {
    expect(withShareAttribution(canonical, 'push')).toBe(`${canonical}?via=share&src=push`);
  });
  it('appends to an existing query', () => {
    expect(withShareAttribution(`${canonical}?x=1`, 'organic')).toBe(`${canonical}?x=1&via=share`);
  });
});

describe('shareSheetContent', () => {
  const copy = { message: `Heat (1995).\n${URL}`, url: URL };
  it('gives iOS the url field', () => {
    expect(shareSheetContent(copy, 'ios')).toEqual({ message: copy.message, url: URL });
  });
  it('folds everything into the message on Android', () => {
    expect(shareSheetContent(copy, 'android')).toEqual({ message: copy.message });
  });
});

describe('formatLeavingDate', () => {
  it('formats weekday, day and month in UTC', () => {
    expect(formatLeavingDate('2026-09-19T00:00:00+00:00')).toBe('Saturday 19 September');
    expect(formatLeavingDate('2026-12-25')).toBe('Friday 25 December');
  });
  it('is empty for nothing or garbage', () => {
    expect(formatLeavingDate(null)).toBe('');
    expect(formatLeavingDate('soon')).toBe('');
  });
});

describe('buildMomentCopy', () => {
  it('arrival', () => {
    expect(buildMomentCopy({ type: 'arrival', serviceId: 'apple' }, 'Severance')).toEqual({
      banner: 'Severance has just landed on Apple TV+. Tell someone.',
      line: 'Just landed on Apple TV+',
    });
  });
  it('leaving soon with a date', () => {
    expect(
      buildMomentCopy({ type: 'leaving_soon', serviceId: 'netflix', expiresOn: '2026-09-19T00:00:00Z' }, 'Heat'),
    ).toEqual({
      banner: 'Heat leaves Netflix on Saturday 19 September. Tell someone.',
      line: 'Leaving Netflix on Saturday 19 September',
    });
  });
  it('leaving soon without a date', () => {
    expect(buildMomentCopy({ type: 'leaving_soon', serviceId: 'netflix' }, 'Heat')?.banner).toBe(
      'Heat leaves Netflix soon. Tell someone.',
    );
  });
  it('nothing without a service', () => {
    expect(buildMomentCopy({ type: 'arrival', serviceId: '' }, 'Heat')).toBeNull();
  });
});

describe('SHARE_SERVICE_LABELS', () => {
  it('is the map the Worker title page uses', () => {
    expect(WORKER_LABELS).toBe(SHARE_SERVICE_LABELS);
  });
});
