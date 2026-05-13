import { beforeEach, describe, expect, it } from 'vitest';

import { deriveKey } from '../src/background/crypto.js';
import {
  getEncryptedValue,
  getPlainValue,
  getStorageKeys,
  removeValue,
  setEncryptedValue,
  setPlainValue,
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

  it('keeps plaintext opt-out values marked and obfuscated', async () => {
    const keys = getStorageKeys('ollama');

    await setPlainValue('ollama', 'local token', { storageArea });

    expect(storageArea.values[keys.plain]).toMatch(/^plain-v1:/);
    expect(storageArea.values[keys.plain]).not.toContain('local token');
    await expect(getPlainValue('ollama', { storageArea })).resolves.toBe('local token');
  });

  it('removes encrypted and plaintext entries together', async () => {
    const key = await deriveKey('storage passphrase', new Uint8Array(16).fill(4));
    const keys = getStorageKeys('openai');

    await setEncryptedValue('openai', 'encrypted token', key, { storageArea });
    await setPlainValue('openai', 'plain token', { storageArea });
    await removeValue('openai', { storageArea });

    expect(storageArea.values[keys.encrypted]).toBeUndefined();
    expect(storageArea.values[keys.plain]).toBeUndefined();
  });
});
