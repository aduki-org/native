/**
 * src/core/events/listen.js
 *
 * High-performance, memory-safe event listener aggregator.
 * Enforces touch/wheel events to passive: true by default to protect INP performance,
 * while seamlessly supporting AbortSignal-gated cleanups and disposer patterns.
 *
 * Source: doc 10 — Event Architecture §2, §3, §13
 */

/**
 * Attaches a memory-safe event listener to a target.
 * Automatically defaults touch/wheel events to passive: true unless explicitly overridden.
 *
 * @param {EventTarget} target - The target element, window, document, or global bus.
 * @param {string} type - The event name to subscribe to.
 * @param {Function} handler - The listener callback function.
 * @param {Object} [options={}] - Standard addEventListener options.
 * @returns {Function} A disposer function that unregisters the listener.
 */
export function listen(target, type, handler, options = {}) {
  const signal = options.signal;
  if (signal?.aborted) return () => {};

  // Automatically default touch and wheel events to passive: true to prevent scroll blocking
  const isPassiveTarget = ['touchstart', 'touchmove', 'wheel', 'mousewheel'].includes(type);
  const listenerOpts = {
    passive: isPassiveTarget ? true : undefined,
    ...options
  };

  const listener = (event) => {
    handler(event);
  };

  target.addEventListener(type, listener, listenerOpts);

  const dispose = () => {
    target.removeEventListener(type, listener, listenerOpts);
    if (signal) {
      signal.removeEventListener('abort', dispose);
    }
  };

  if (signal) {
    signal.addEventListener('abort', dispose, { once: true });
  }

  return dispose;
}
