import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decryptString, encryptString } from '../src/background/crypto.js';
import {
  getSessionKey,
  getSessionState,
  lockSession,
  unlockSession,
} from '../src/background/session-key.js';

describe('session key', () => {
  beforeEach(() => {
    lockSession();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts locked and throws without an unlocked key', () => {
    expect(getSessionState()).toEqual({ locked: true });
    expect(() => getSessionKey()).toThrow('Session key is locked.');
  });

  it('unlocks with a reusable salt', async () => {
    const firstUnlock = await unlockSession('session passphrase');
    const firstKey = getSessionKey();
    const encrypted = await encryptString('in memory only', firstKey);

    lockSession();
    await unlockSession('session passphrase', firstUnlock.salt);

    await expect(decryptString(encrypted, getSessionKey())).resolves.toBe('in memory only');
    expect(getSessionState()).toMatchObject({
      locked: false,
      salt: firstUnlock.salt,
    });
  });

  it('evicts the session key after 30 minutes idle', async () => {
    vi.useFakeTimers();

    await unlockSession('session passphrase');

    expect(getSessionState().locked).toBe(false);
    vi.advanceTimersByTime(30 * 60 * 1000 - 1);
    expect(getSessionState().locked).toBe(false);

    vi.advanceTimersByTime(1);

    expect(getSessionState()).toEqual({ locked: true });
    expect(() => getSessionKey()).toThrow('Session key is locked.');
  });

  it('refreshes the eviction timer when the key is used', async () => {
    vi.useFakeTimers();

    await unlockSession('session passphrase');
    vi.advanceTimersByTime(20 * 60 * 1000);
    getSessionKey();
    vi.advanceTimersByTime(20 * 60 * 1000);

    expect(getSessionState().locked).toBe(false);
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(getSessionState()).toEqual({ locked: true });
  });
});
