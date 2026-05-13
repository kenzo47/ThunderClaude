import { base64ToBytes, bytesToBase64, createSalt, deriveKey } from './crypto.js';

let session = null;

export async function unlockSession(passphrase, existingSalt = null) {
  const salt = existingSalt ? base64ToBytes(existingSalt) : createSalt();
  const key = await deriveKey(passphrase, salt);

  session = {
    key,
    salt: bytesToBase64(salt),
    unlockedAt: Date.now(),
  };

  return {
    salt: session.salt,
    unlockedAt: session.unlockedAt,
  };
}

export function getSessionKey() {
  if (!session) {
    throw new Error('Session key is locked.');
  }

  return session.key;
}

export function getSessionState() {
  if (!session) {
    return {
      locked: true,
    };
  }

  return {
    locked: false,
    salt: session.salt,
    unlockedAt: session.unlockedAt,
  };
}

export function lockSession() {
  session = null;
}
