/**
 * src/core/events/delegate.js
 *
 * High-performance event delegation with fast-path selector matching.
 * Handles dynamic delegation of events traversing Shadow DOM boundaries
 * by evaluating event.composedPath(), caching matcher evaluations in a WeakMap.
 *
 * Source: doc 10 — Event Architecture §6
 */

// Dual-layered WeakMap cache to prevent redundant CSS selector evaluations
const matchesCache = new WeakMap();

/**
 * Checks if an element matches a selector using cached query evaluations.
 */
function matchesSelector(element, selector) {
  if (!element || typeof element.matches !== 'function') {
    return false;
  }

  let selectorMap = matchesCache.get(element);
  if (!selectorMap) {
    selectorMap = new Map();
    matchesCache.set(element, selectorMap);
  }

  if (selectorMap.has(selector)) {
    return selectorMap.get(selector);
  }

  const result = element.matches(selector);
  selectorMap.set(selector, result);
  return result;
}

/**
 * Attaches a delegated event listener to an ancestor root element.
 *
 * @param {EventTarget} root - The root container element.
 * @param {string} selector - The query selector to match dynamic descendants.
 * @param {string} type - The event name to intercept.
 * @param {Function} handler - The listener callback, with `this` bound to the matched element.
 * @param {Object} [options={}] - Standard addEventListener options.
 * @returns {Function} A disposer function that unregisters the delegation hook.
 */
export function delegate(root, selector, type, handler, options = {}) {
  const signal = options.signal;
  if (signal?.aborted) return () => {};

  const listener = (event) => {
    // composedPath() contains the full bubble chain, traversing through nested shadow trees
    const path = event.composedPath();

    for (const target of path) {
      if (target === root) break;
      if (matchesSelector(target, selector)) {
        // Invoke handler with matched element bound to `this`
        handler.call(target, event, target);
        break;
      }
    }
  };

  root.addEventListener(type, listener, options);

  const dispose = () => {
    root.removeEventListener(type, listener, options);
    if (signal) {
      signal.removeEventListener('abort', dispose);
    }
  };

  if (signal) {
    signal.addEventListener('abort', dispose, { once: true });
  }

  return dispose;
}
