const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function getCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto is unavailable.');
  }

  return globalThis.crypto;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return bytes;
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function createSalt() {
  return randomBytes(SALT_BYTES);
}

export function createRawAesKey() {
  return randomBytes(32);
}

export async function importAesKey(rawKey) {
  return getCrypto().subtle.importKey(
    'raw',
    rawKey,
    {
      name: 'AES-GCM',
    },
    false,
    ['encrypt', 'decrypt']
  );
}

async function importPassphrase(passphrase) {
  return getCrypto().subtle.importKey('raw', TEXT_ENCODER.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
}

export async function deriveKey(passphrase, salt) {
  if (!passphrase) {
    throw new Error('Passphrase is required.');
  }

  return getCrypto().subtle.deriveKey(
    {
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      name: 'PBKDF2',
      salt,
    },
    await importPassphrase(passphrase),
    {
      length: 256,
      name: 'AES-GCM',
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptString(plaintext, key) {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await getCrypto().subtle.encrypt(
    {
      iv,
      name: 'AES-GCM',
    },
    key,
    TEXT_ENCODER.encode(plaintext)
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    version: 1,
  };
}

export async function decryptString(record, key) {
  if (record?.version !== 1 || !record.ciphertext || !record.iv) {
    throw new Error('Unsupported encrypted value.');
  }

  const plaintext = await getCrypto().subtle.decrypt(
    {
      iv: base64ToBytes(record.iv),
      name: 'AES-GCM',
    },
    key,
    base64ToBytes(record.ciphertext)
  );

  return TEXT_DECODER.decode(plaintext);
}

export async function encryptWithPassphrase(plaintext, passphrase) {
  const salt = createSalt();
  const key = await deriveKey(passphrase, salt);
  const encrypted = await encryptString(plaintext, key);

  return {
    ...encrypted,
    kdf: {
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      name: 'PBKDF2',
      salt: bytesToBase64(salt),
    },
  };
}

export async function decryptWithPassphrase(record, passphrase) {
  if (record?.kdf?.name !== 'PBKDF2' || !record.kdf.salt) {
    throw new Error('Unsupported encrypted value.');
  }

  const key = await deriveKey(passphrase, base64ToBytes(record.kdf.salt));
  return decryptString(record, key);
}

export const cryptoParameters = Object.freeze({
  ivBytes: IV_BYTES,
  kdfHash: 'SHA-256',
  kdfIterations: PBKDF2_ITERATIONS,
  saltBytes: SALT_BYTES,
});
