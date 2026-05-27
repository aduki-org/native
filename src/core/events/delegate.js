/**
 * src/core/events/delegate.js
 *
 * High-performance event delegation.
 * Handles dynamic delegation of events traversing Shadow DOM boundaries
 * by evaluating event.composedPath(), safely matching selectors on dynamic descendants.
 *
 * Source: doc 10 — Event Architecture §6
 */

/**
 * Attaches a delegated event listener to an ancestor root element.
 */
export function delegate(root, selector, type, handler, options = {}) {
  const signal = options.signal;
  if (signal?.aborted) return () => {};

  const listener = (event) => {
    // composedPath() contains the full bubble chain, traversing through nested shadow trees
    const path = event.composedPath();

    for (const target of path) {
      if (target === root) break;
      if (target.matches && target.matches(selector)) {
        // Invoke handler with matched element bound to `this`
        handler.call(target, event, target);
        break;
      }
    }
  };

  root.addEventListener(type, listener, options);

  const dispose = () => {
    root.removeEventListener(type, listener, options);
  };

  if (signal) {
    signal.addEventListener('abort', dispose);
  }

  return dispose;
}
