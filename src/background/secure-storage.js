import {
  base64ToBytes,
  bytesToBase64,
  createRawAesKey,
  decryptString,
  encryptString,
  importAesKey,
} from './crypto.js';

const STORAGE_PREFIX = 'thunderclaude.secure.';
const LEGACY_PLAIN_PREFIX = 'thunderclaude.plain.';
const LOCAL_KEY_NAME = `${STORAGE_PREFIX}local-key`;
const LOCAL_KEY_VERSION = 'local-v1';

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

async function getLocalEncryptionKey(storageArea) {
  const result = await storageArea.get(LOCAL_KEY_NAME);
  let rawKey = result[LOCAL_KEY_NAME];

  if (!rawKey) {
    rawKey = bytesToBase64(createRawAesKey());
    await storageArea.set({
      [LOCAL_KEY_NAME]: rawKey,
    });
  }

  return importAesKey(base64ToBytes(rawKey));
}

export async function setEncryptedValue(name, plaintext, options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  const keyName = storageKey(name);
  const key = await getLocalEncryptionKey(storageArea);
  const encrypted = await encryptString(plaintext, key);

  await storageArea.set({
    [keyName]: {
      encrypted,
      mode: 'encrypted',
      keyVersion: LOCAL_KEY_VERSION,
    },
  });
}

export async function getEncryptedValue(name, options = {}) {
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

  if (stored.keyVersion !== LOCAL_KEY_VERSION) {
    throw new Error('Stored provider key must be saved again.');
  }

  const key = await getLocalEncryptionKey(storageArea);
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
