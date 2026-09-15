import { describe, expect, it } from 'vitest';

import type { ChannelOption } from '@/lib/adapters/detailAdapter';
import { classifyProviders } from '../providerClassifier';

const shudder: ChannelOption = { serviceKey: 'prime', channelName: 'Shudder', channelToken: 'prime:shuddertv' };
const simplySouth: ChannelOption = { serviceKey: 'prime', channelName: 'Simply South', channelToken: 'prime:simplysouthchuk' };
const untokened: ChannelOption = { serviceKey: 'apple', channelName: 'Legacy row' };

describe('classifyProviders — channels (IN-SC-004)', () => {
  it('keeps the three service tiers unchanged and lists every channel as other by default', () => {
    const out = classifyProviders(['netflix', 'prime'], [], ['prime'], [shudder, simplySouth]);
    expect(out.tier1).toEqual(['prime']);
    expect(out.tier2).toEqual(['netflix']);
    expect(out.heldChannels).toEqual([]);
    expect(out.otherChannels).toEqual([shudder, simplySouth]);
  });

  it('promotes held channel tokens and never an option without a token', () => {
    const out = classifyProviders([], [], ['prime', 'apple'], [shudder, simplySouth, untokened], [
      'prime:shuddertv',
    ]);
    expect(out.heldChannels).toEqual([shudder]);
    expect(out.otherChannels).toEqual([simplySouth, untokened]);
  });
});
