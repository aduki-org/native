/**
 * src/core/security/crypto.js
 *
 * Web Cryptography Facade.
 * Offloads all cryptographic functions to standard async SubtleCrypto thread pools,
 * generating fresh IVs for AES-GCM and enforcing robust key derivation iterations.
 *
 * Source: doc 15 — Security Architecture §3
 */

/**
 * Returns a cryptographically secure random UUID string.
 */
export function uuid() {
  return crypto.randomUUID();
}

/**
 * Digests data into an ArrayBuffer hash using a specified algorithm.
 */
export async function hash(data, algo = 'SHA-256') {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return crypto.subtle.digest(algo, buf);
}

/**
 * Generates a non-extractable CryptoKey default.
 */
export async function generateKey(algo = 'AES-GCM', usages = ['encrypt', 'decrypt'], extractable = false) {
  let param;
  if (algo === 'AES-GCM') {
    param = { name: 'AES-GCM', length: 256 };
  } else if (algo === 'HMAC') {
    param = { name: 'HMAC', hash: { name: 'SHA-256' } };
  } else {
    param = algo;
  }
  return crypto.subtle.generateKey(param, extractable, usages);
}

/**
 * Derives an AES-GCM key from a password and salt using PBKDF2 with 600,000 iterations.
 */
export async function deriveKey(password, salt, iterations = 600000) {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const saltBuf = typeof salt === 'string' ? enc.encode(salt) : salt;

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable by default
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts data using AES-GCM with a fresh 12-byte IV, prepending it to the ciphertext.
 */
export async function encrypt(key, data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    buf
  );

  // Combine IV and Ciphertext for simple storage transit
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined.buffer;
}

/**
 * Decrypts a combined IV-ciphertext payload.
 */
export async function decrypt(key, combinedData) {
  const view = new Uint8Array(combinedData);
  const iv = view.slice(0, 12);
  const ciphertext = view.slice(12);

  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
}

/**
 * Signs data using HMAC or ECDSA signatures.
 */
export async function sign(key, data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const alg = key.algorithm.name === 'HMAC' 
    ? { name: 'HMAC' } 
    : { name: 'ECDSA', hash: { name: 'SHA-256' } };

  return crypto.subtle.sign(alg, key, buf);
}

/**
 * Verifies a signature using HMAC or ECDSA.
 */
export async function verify(key, signature, data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const alg = key.algorithm.name === 'HMAC' 
    ? { name: 'HMAC' } 
    : { name: 'ECDSA', hash: { name: 'SHA-256' } };

  return crypto.subtle.verify(alg, key, signature, buf);
}
