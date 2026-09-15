import { describe, expect, it } from 'vitest';

import {
  availabilityOrFilter,
  channelChoicesFor,
  channelDisplayName,
  channelTokensFor,
  hashIdList,
  knownChannelIds,
  parseChannelsParam,
  type ChannelRegistryRow,
} from '../channels';

const row = (
  parentServiceId: string,
  addonId: string,
  channelId: string,
  displayName: string,
  standaloneServiceId: string | null,
  sort: number,
): ChannelRegistryRow => ({ parentServiceId, addonId, channelId, displayName, standaloneServiceId, sort });

// A slice of the 086 seed: a standalone-mapped channel with two Prime ids
// and an Apple id, a plain channel on two parents, and a NOW pass.
const REGISTRY: ChannelRegistryRow[] = [
  row('prime', 'maxuk', 'hbo', 'HBO Max', 'hbo', 10),
  row('prime', 'maxpayoneuk', 'hbo', 'HBO Max', 'hbo', 10),
  row('prime', 'paramountplusgb', 'paramount', 'Paramount+', 'paramount', 20),
  row('apple', 'tvs.sbd.1000439', 'paramount', 'Paramount+', 'paramount', 20),
  row('apple', 'tvs.sbd.10120', 'paramount', 'Paramount+', 'paramount', 20),
  row('prime', 'studiocanalpresentsuk', 'studiocanal', 'STUDIOCANAL Presents', null, 90),
  row('apple', 'tvs.sbd.1000482', 'studiocanal', 'STUDIOCANAL Presents', null, 90),
  row('prime', 'shuddertv', 'shudder', 'Shudder', null, 110),
  row('prime', 'hayu', 'hayu', 'Hayu', null, 60),
  row('now', 'hayu', 'hayu', 'Hayu', null, 30),
  row('now', 'movies', 'now_cinema', 'Cinema', null, 10),
];

describe('channelTokensFor', () => {
  it('holds nothing without channels or standalone services', () => {
    expect(channelTokensFor(REGISTRY, ['netflix', 'prime', 'apple'], [])).toEqual([]);
  });

  it('counts a plain channel only on parents the user holds', () => {
    expect(channelTokensFor(REGISTRY, ['prime'], ['studiocanal'])).toEqual(['prime:studiocanalpresentsuk']);
    expect(channelTokensFor(REGISTRY, ['prime', 'apple'], ['studiocanal'])).toEqual([
      'apple:tvs.sbd.1000482',
      'prime:studiocanalpresentsuk',
    ]);
    expect(channelTokensFor(REGISTRY, ['netflix'], ['studiocanal', 'shudder'])).toEqual([]);
  });

  it('treats a standalone service as the channel on every parent, merged ids included', () => {
    expect(channelTokensFor(REGISTRY, ['paramount'], [])).toEqual([
      'apple:tvs.sbd.1000439',
      'apple:tvs.sbd.10120',
      'prime:paramountplusgb',
    ]);
    expect(channelTokensFor(REGISTRY, ['hbo', 'prime'], [])).toEqual(['prime:maxpayoneuk', 'prime:maxuk']);
  });

  it('ignores a standalone id sent as a channel', () => {
    expect(channelTokensFor(REGISTRY, ['prime'], ['hbo'])).toEqual([]);
  });

  it('holds one channel however it is bought (Hayu via Prime or NOW)', () => {
    expect(channelTokensFor(REGISTRY, ['now'], ['hayu'])).toEqual(['now:hayu']);
    expect(channelTokensFor(REGISTRY, ['now', 'prime'], ['hayu'])).toEqual(['now:hayu', 'prime:hayu']);
  });
});

describe('knownChannelIds', () => {
  it('keeps registry channels, drops unknown and standalone ids, sorts and dedupes', () => {
    expect(knownChannelIds(REGISTRY, ['shudder', 'bogus', 'hbo', 'hayu', 'shudder'])).toEqual(['hayu', 'shudder']);
  });
});

describe('channelChoicesFor', () => {
  it('lists one chip per channel for a parent, in registry order', () => {
    expect(channelChoicesFor(REGISTRY, 'prime').map((c) => c.channelId)).toEqual([
      'hbo',
      'paramount',
      'hayu',
      'studiocanal',
      'shudder',
    ]);
    expect(channelChoicesFor(REGISTRY, 'apple').map((c) => c.channelId)).toEqual(['paramount', 'studiocanal']);
    expect(channelChoicesFor(REGISTRY, 'netflix')).toEqual([]);
  });
});

describe('channelDisplayName', () => {
  it('names curated addon rows and returns null for the tail', () => {
    expect(channelDisplayName(REGISTRY, 'apple', 'tvs.sbd.1000482')).toBe('STUDIOCANAL Presents');
    expect(channelDisplayName(REGISTRY, 'prime', 'simplysouthchuk')).toBeNull();
  });
});

describe('parseChannelsParam', () => {
  it('normalises and drops malformed ids', () => {
    expect(parseChannelsParam(' Shudder,mgm_plus,,shudder,bad-id,' + 'x'.repeat(41))).toEqual(['shudder', 'mgm_plus']);
    expect(parseChannelsParam(undefined)).toEqual([]);
  });

  it('rejects an oversized list', () => {
    const many = Array.from({ length: 31 }, (_, i) => `c${i}`).join(',');
    expect(parseChannelsParam(many)).toBeNull();
  });
});

describe('availabilityOrFilter', () => {
  it('quotes array elements so vendor ids with dots and colons survive PostgREST parsing', () => {
    expect(availabilityOrFilter(['netflix', 'prime'], ['apple:tvs.sbd.1000482', 'prime:mgm'])).toBe(
      'available_services.ov.{"netflix","prime"},channel_services.ov.{"apple:tvs.sbd.1000482","prime:mgm"}',
    );
  });
});

describe('hashIdList', () => {
  it('is order-independent and distinguishes different lists', () => {
    expect(hashIdList(['b', 'a'])).toBe(hashIdList(['a', 'b']));
    expect(hashIdList(['a'])).not.toBe(hashIdList(['a', 'b']));
  });
});
