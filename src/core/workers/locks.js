/**
 * src/core/workers/locks.js
 *
 * Web Locks API Facade.
 * Coordinates exclusive or shared operational execution blocks safely,
 * providing AbortSignal and timeout controls with a clean RAII model.
 *
 * Source: doc 21 — Worker Architecture §7
 */

/**
 * Executes a callback within a managed lock environment.
 */
export async function lock(name, fn, options = {}) {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    // Graceful fallback for unsupported browser environments
    return fn();
  }

  const { signal, mode = 'exclusive', timeout } = options;

  let activeSignal = signal;
  let timerId = null;

  // Set up manual AbortController if a numerical timeout is provided
  if (timeout && !signal) {
    const controller = new AbortController();
    timerId = setTimeout(() => {
      controller.abort(new Error(`Web Lock "${name}" acquisition timed out after ${timeout}ms`));
    }, timeout);
    activeSignal = controller.signal;
  }

  try {
    return await navigator.locks.request(
      name,
      { mode, signal: activeSignal },
      async (acquiredLock) => {
        if (!acquiredLock) {
          throw new Error(`Web Lock "${name}" acquisition was aborted`);
        }
        return await fn();
      }
    );
  } catch (err) {
    if (err.name === 'AbortError' && timeout && activeSignal.aborted) {
      throw new Error(`Web Lock "${name}" acquisition timed out after ${timeout}ms`);
    }
    throw err;
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
  }
}
