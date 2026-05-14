import { decryptString, encryptString } from './crypto.js';

const STORAGE_PREFIX = 'thunderclaude.secure.';
const LEGACY_PLAIN_PREFIX = 'thunderclaude.plain.';

export function getStorageArea(storageArea) {
  const resolvedArea =
    storageArea ?? globalThis.messenger?.storage?.local ?? globalThis.browser?.storage?.local;

  if (!resolvedArea) {
    throw new Error('storage.local is unavailable.');
  }

  return resolvedArea;
}

function storageKey(name) {
  if (!name) {
    throw new Error('Storage name is required.');
  }

  return `${STORAGE_PREFIX}${name}`;
}

function legacyPlainStorageKey(name) {
  if (!name) {
    throw new Error('Storage name is required.');
  }

  return `${LEGACY_PLAIN_PREFIX}${name}`;
}

export async function setEncryptedValue(name, plaintext, key, options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  const keyName = storageKey(name);
  const encrypted = await encryptString(plaintext, key);

  await storageArea.set({
    [keyName]: {
      encrypted,
      mode: 'encrypted',
    },
  });
}

export async function getEncryptedValue(name, key, options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  const keyName = storageKey(name);
  const result = await storageArea.get(keyName);
  const stored = result[keyName];

  if (!stored) {
    return null;
  }

  if (stored.mode !== 'encrypted') {
    throw new Error('Stored value is not encrypted.');
  }

  return decryptString(stored.encrypted, key);
}

export async function removeValue(name, options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  await storageArea.remove([storageKey(name), legacyPlainStorageKey(name)]);
}

export function getStorageKeys(name) {
  return {
    encrypted: storageKey(name),
    legacyPlain: legacyPlainStorageKey(name),
  };
}
