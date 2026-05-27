/**
 * src/core/api/retry.js
 *
 * Implements exponential backoff with jitter for transient errors.
 * Ensures the network layer is self-healing for temporary disconnects/server errors,
 * while instantly failing client-side (4xx) errors.
 *
 * Source: doc 11 — Networking §8
 */

import { PlatformError } from './fetch.js';

/**
 * Retries an asynchronous operation with exponential backoff and full jitter.
 */
export async function retry(operation, options = {}) {
  const {
    attempts = 3,
    base = 100, // starting delay in ms
    maxDelay = 3000, // maximum wait time in ms
    signal
  } = options;

  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw new PlatformError({
        code: 'NETWORK_ERROR',
        message: 'Network request aborted before retry attempt',
        recoverable: false
      });
    }

    try {
      return await operation();
    } catch (err) {
      attempt++;

      // Qualify transient failure: Network dropouts, timeouts, or server (5xx) issues
      const isTransient = err.code === 'NETWORK_TIMEOUT' ||
                          err.code === 'NETWORK_ERROR' ||
                          (err.code === 'HTTP_ERROR' && err.context?.status >= 500);

      if (attempt >= attempts || !isTransient) {
        throw err;
      }

      // Exponential backoff with full jitter calculation
      const tempDelay = base * Math.pow(2, attempt);
      const delay = Math.random() * Math.min(maxDelay, tempDelay);

      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(resolve, delay);

        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new PlatformError({
              code: 'NETWORK_ERROR',
              message: 'Network request aborted during retry backoff',
              recoverable: false
            }));
          });
        }
      });
    }
  }
}
