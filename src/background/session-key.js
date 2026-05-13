import { base64ToBytes, bytesToBase64, createSalt, deriveKey } from './crypto.js';

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

let session = null;
let evictionTimer = null;

function clearEvictionTimer() {
  if (evictionTimer !== null) {
    clearTimeout(evictionTimer);
    evictionTimer = null;
  }
}

function scheduleEviction() {
  clearEvictionTimer();

  if (!session) {
    return;
  }

  session.expiresAt = Date.now() + SESSION_IDLE_TIMEOUT_MS;
  evictionTimer = setTimeout(() => {
    session = null;
    evictionTimer = null;
  }, SESSION_IDLE_TIMEOUT_MS);
  evictionTimer.unref?.();
}

export async function unlockSession(passphrase, existingSalt = null) {
  const salt = existingSalt ? base64ToBytes(existingSalt) : createSalt();
  const key = await deriveKey(passphrase, salt);

  session = {
    key,
    salt: bytesToBase64(salt),
    unlockedAt: Date.now(),
  };
  scheduleEviction();

  return {
    expiresAt: session.expiresAt,
    salt: session.salt,
    unlockedAt: session.unlockedAt,
  };
}

export function getSessionKey() {
  if (!session) {
    throw new Error('Session key is locked.');
  }

  scheduleEviction();

  return session.key;
}

export function getSessionState() {
  if (!session) {
    return {
      locked: true,
    };
  }

  return {
    expiresAt: session.expiresAt,
    locked: false,
    salt: session.salt,
    unlockedAt: session.unlockedAt,
  };
}

export function lockSession() {
  clearEvictionTimer();
  session = null;
}
