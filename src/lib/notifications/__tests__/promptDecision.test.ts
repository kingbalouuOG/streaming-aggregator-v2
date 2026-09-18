import { describe, expect, it } from 'vitest';

import {
  decidePushPrompt,
  parsePromptRecord,
  PROMPT_RECORD_ASKED,
  PROMPT_RECORD_DECLINED,
  toPushPermission,
  type PromptInputs,
} from '../promptDecision';

const base: PromptInputs = {
  signedIn: true,
  isDevice: true,
  permission: 'askable',
  record: null,
  pendingLink: false,
};

describe('decidePushPrompt', () => {
  it('explains when permission is undetermined and nothing was asked', () => {
    expect(decidePushPrompt(base)).toBe('explain');
  });

  it('registers silently when permission is already granted', () => {
    expect(decidePushPrompt({ ...base, permission: 'granted' })).toBe('register');
  });

  it('registers when granted even after an earlier ask or decline', () => {
    expect(decidePushPrompt({ ...base, permission: 'granted', record: 'asked' })).toBe('register');
    expect(decidePushPrompt({ ...base, permission: 'granted', record: 'declined' })).toBe('register');
  });

  it('never shows when permission is permanently blocked', () => {
    expect(decidePushPrompt({ ...base, permission: 'blocked' })).toBe('skip');
  });

  it('does not ask again once the system prompt was shown', () => {
    expect(decidePushPrompt({ ...base, record: 'asked' })).toBe('skip');
  });

  it('does not ask again after "Not now"', () => {
    expect(decidePushPrompt({ ...base, record: 'declined' })).toBe('skip');
  });

  it('waits while a shared link is still to be shown', () => {
    expect(decidePushPrompt({ ...base, pendingLink: true })).toBe('wait');
  });

  it('a pending link never overrides a skip', () => {
    expect(decidePushPrompt({ ...base, pendingLink: true, record: 'declined' })).toBe('skip');
    expect(decidePushPrompt({ ...base, pendingLink: true, permission: 'blocked' })).toBe('skip');
  });

  it('skips when signed out or on a simulator', () => {
    expect(decidePushPrompt({ ...base, signedIn: false })).toBe('skip');
    expect(decidePushPrompt({ ...base, isDevice: false })).toBe('skip');
    expect(decidePushPrompt({ ...base, signedIn: false, permission: 'granted' })).toBe('skip');
  });
});

describe('toPushPermission', () => {
  it('granted wins', () => {
    expect(toPushPermission({ granted: true, canAskAgain: true })).toBe('granted');
  });

  it('Android 13+ fresh install (status denied, canAskAgain true) is askable', () => {
    expect(toPushPermission({ granted: false, canAskAgain: true })).toBe('askable');
  });

  it('iOS denial or second Android denial is blocked', () => {
    expect(toPushPermission({ granted: false, canAskAgain: false })).toBe('blocked');
  });
});

describe('parsePromptRecord', () => {
  it('reads the stored values', () => {
    expect(parsePromptRecord(null)).toBeNull();
    expect(parsePromptRecord(undefined)).toBeNull();
    expect(parsePromptRecord('')).toBeNull();
    expect(parsePromptRecord(PROMPT_RECORD_ASKED)).toBe('asked');
    expect(parsePromptRecord(PROMPT_RECORD_DECLINED)).toBe('declined');
  });
});
