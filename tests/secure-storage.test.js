import { beforeEach, describe, expect, it } from 'vitest';

import { deriveKey } from '../src/background/crypto.js';
import {
  getEncryptedValue,
  getStorageKeys,
  removeValue,
  setEncryptedValue,
} from '../src/background/secure-storage.js';

function createStorageArea() {
  const values = {};

  return {
    values,
    async get(key) {
      return {
        [key]: values[key],
      };
    },
    async remove(keys) {
      for (const key of keys) {
        delete values[key];
      }
    },
    async set(items) {
      Object.assign(values, items);
    },
  };
}

describe('secure storage wrapper', () => {
  let storageArea;

  beforeEach(() => {
    storageArea = createStorageArea();
  });

  it('stores encrypted values without plaintext', async () => {
    const key = await deriveKey('storage passphrase', new Uint8Array(16).fill(3));
    const keys = getStorageKeys('anthropic');

    await setEncryptedValue('anthropic', 'sk-test-fake-key-do-not-use', key, { storageArea });

    expect(JSON.stringify(storageArea.values[keys.encrypted])).not.toContain(
      'sk-test-fake-key-do-not-use'
    );
    await expect(getEncryptedValue('anthropic', key, { storageArea })).resolves.toBe(
      'sk-test-fake-key-do-not-use'
    );
  });

  it('removes encrypted and legacy plaintext entries together', async () => {
    const key = await deriveKey('storage passphrase', new Uint8Array(16).fill(4));
    const keys = getStorageKeys('openai');

    await setEncryptedValue('openai', 'encrypted token', key, { storageArea });
    storageArea.values[keys.legacyPlain] = 'plain-v1:legacy-value';
    await removeValue('openai', { storageArea });

    expect(storageArea.values[keys.encrypted]).toBeUndefined();
    expect(storageArea.values[keys.legacyPlain]).toBeUndefined();
  });
});
