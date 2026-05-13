import { decryptString, encryptString } from './crypto.js';

const STORAGE_PREFIX = 'thunderclaude.secure.';
const PLAIN_PREFIX = 'thunderclaude.plain.';
const PLAIN_MARKER = 'plain-v1:';
const OBFUSCATION_KEY = 'ThunderClaude local plaintext storage warning';

function getStorageArea(storageArea) {
  const resolvedArea =
    storageArea ?? globalThis.messenger?.storage?.local ?? globalThis.browser?.storage?.local;

  if (!resolvedArea) {
    throw new Error('storage.local is unavailable.');
  }

  return resolvedArea;
}

function storageKey(name, mode) {
  if (!name) {
    throw new Error('Storage name is required.');
  }

  return `${mode === 'plain' ? PLAIN_PREFIX : STORAGE_PREFIX}${name}`;
}

function xorWithWarning(value) {
  const valueBytes = new TextEncoder().encode(value);
  const keyBytes = new TextEncoder().encode(OBFUSCATION_KEY);
  const output = new Uint8Array(valueBytes.length);

  for (let index = 0; index < valueBytes.length; index += 1) {
    output[index] = valueBytes[index] ^ keyBytes[index % keyBytes.length];
  }

  let binary = '';
  for (const byte of output) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function undoXorWithWarning(value) {
  const input = atob(value);
  const inputBytes = new Uint8Array(input.length);
  const keyBytes = new TextEncoder().encode(OBFUSCATION_KEY);
  const output = new Uint8Array(inputBytes.length);

  for (let index = 0; index < input.length; index += 1) {
    inputBytes[index] = input.charCodeAt(index);
    output[index] = inputBytes[index] ^ keyBytes[index % keyBytes.length];
  }

  return new TextDecoder().decode(output);
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

export async function setPlainValue(name, plaintext, options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  const keyName = storageKey(name, 'plain');

  await storageArea.set({
    [keyName]: `${PLAIN_MARKER}${xorWithWarning(plaintext)}`,
  });
}

export async function getPlainValue(name, options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  const keyName = storageKey(name, 'plain');
  const result = await storageArea.get(keyName);
  const stored = result[keyName];

  if (!stored) {
    return null;
  }

  if (!stored.startsWith(PLAIN_MARKER)) {
    throw new Error('Unsupported plaintext value.');
  }

  return undoXorWithWarning(stored.slice(PLAIN_MARKER.length));
}

export async function removeValue(name, options = {}) {
  const storageArea = getStorageArea(options.storageArea);
  await storageArea.remove([storageKey(name), storageKey(name, 'plain')]);
}

export function getStorageKeys(name) {
  return {
    encrypted: storageKey(name),
    plain: storageKey(name, 'plain'),
  };
}
