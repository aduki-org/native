/**
 * src/core/events/once.js
 *
 * Promise-wrapped single-event listener.
 * Dynamically resolves a promise upon event completion, utilizing native browser cleanup properties.
 *
 * Source: doc 10 — Event Architecture §2, §3
 */

/**
 * Awaits a single event occurrence on a given target, resolving with the Event object.
 */
export function once(target, type, options = {}) {
  const { signal, ...listenerOpts } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Operation aborted'));
    }

    let onAbort;

    const cleanup = () => {
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const callback = (event) => {
      cleanup();
      resolve(event);
    };

    // Modern browsers support signal natively inside addEventListener options
    target.addEventListener(type, callback, {
      once: true,
      ...listenerOpts,
      signal
    });

    if (signal) {
      onAbort = () => {
        cleanup();
        reject(new Error('Operation aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
