import { describe, expect, it } from 'vitest';

import {
  cryptoParameters,
  decryptString,
  decryptWithPassphrase,
  deriveKey,
  encryptString,
  encryptWithPassphrase,
} from '../src/background/crypto.js';

describe('crypto module', () => {
  it('uses the planned PBKDF2 and AES-GCM parameters', () => {
    expect(cryptoParameters).toEqual({
      ivBytes: 12,
      kdfHash: 'SHA-256',
      kdfIterations: 600_000,
      saltBytes: 16,
    });
  });

  it('round trips text with a derived key', async () => {
    const salt = new Uint8Array(16).fill(7);
    const key = await deriveKey('correct horse battery staple', salt);
    const encrypted = await encryptString('draft rewrite token', key);

    await expect(decryptString(encrypted, key)).resolves.toBe('draft rewrite token');
    expect(encrypted.ciphertext).not.toContain('draft rewrite token');
  });

  it('round trips text with a passphrase envelope', async () => {
    const encrypted = await encryptWithPassphrase('provider credential', 'passphrase');

    await expect(decryptWithPassphrase(encrypted, 'passphrase')).resolves.toBe(
      'provider credential'
    );
    await expect(decryptWithPassphrase(encrypted, 'wrong passphrase')).rejects.toThrow();
  });
});
