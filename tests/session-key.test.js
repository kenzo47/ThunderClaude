import { beforeEach, describe, expect, it } from 'vitest';

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
});
