/**
 * src/core/api/fetch.js
 *
 * Core fetch wrapper with AbortSignal, timeouts, and browser task priorities.
 * Maps network and HTTP responses to a standard library-wide error shape.
 *
 * Source: doc 11 — Networking §3, §4, §9
 */

export class PlatformError extends Error {
  constructor({ code, message, cause, context, recoverable = true }) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
    this.cause = cause;
    this.context = context || {};
    this.recoverable = recoverable;
  }
}

/**
 * Executes a network fetch request with standard platform enhancements.
 */
export async function execute(descriptor) {
  const {
    url,
    timeout = 10000,
    priority = 'user-visible',
    signal,
    ...fetchOpts
  } = descriptor;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('timeout'), timeout);

  // Compose signals cleanly (leveraging AbortSignal.any where supported)
  let activeSignal = controller.signal;
  if (signal) {
    if (typeof AbortSignal.any === 'function') {
      activeSignal = AbortSignal.any([controller.signal, signal]);
    } else {
      if (signal.aborted) {
        controller.abort(signal.reason);
      } else {
        signal.addEventListener('abort', () => {
          controller.abort(signal.reason || 'aborted');
        });
      }
    }
  }

  const runFetch = async () => {
    try {
      const response = await fetch(url, { ...fetchOpts, signal: activeSignal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new PlatformError({
          code: 'HTTP_ERROR',
          message: `HTTP error ${response.status}: ${response.statusText}`,
          context: { url, status: response.status, method: fetchOpts.method || 'GET' },
          recoverable: response.status >= 500
        });
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof PlatformError) throw err;

      const isTimeout = activeSignal.aborted && controller.signal.aborted;
      throw new PlatformError({
        code: isTimeout ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
        message: err.message || (isTimeout ? 'Network request timed out' : 'Network request failed'),
        cause: err,
        context: { url, method: fetchOpts.method || 'GET' },
        recoverable: true
      });
    }
  };

  // Run in browser task scheduler if supported (improves Interaction to Next Paint)
  if (typeof globalThis.scheduler !== 'undefined' && typeof scheduler.postTask === 'function') {
    return scheduler.postTask(runFetch, { priority, signal: activeSignal }).catch((err) => {
      if (err instanceof PlatformError) throw err;
      const isTimeout = activeSignal.aborted && controller.signal.aborted;
      throw new PlatformError({
        code: isTimeout ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
        message: err.message || (isTimeout ? 'Network request timed out' : 'Network request failed'),
        cause: err,
        context: { url, method: fetchOpts.method || 'GET' },
        recoverable: true
      });
    });
  }

  return runFetch();
}
