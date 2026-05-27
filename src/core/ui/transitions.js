/**
 * src/core/ui/transitions.js
 *
 * View Transitions Wrapper.
 * Orchestrates CSS View Transitions with a strict media-query guard that
 * automatically skips animations for users who prefer reduced motion.
 *
 * Source: doc 03 — Native CSS Architecture §6, doc 12 — Performance §4
 */

/**
 * Initiates a View Transition, falling back gracefully to direct callback invocation
 * if the browser does not support it or if prefers-reduced-motion is active.
 */
export function transition(fn) {
  const isReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Direct invoke if unsupported or user has reduced-motion settings active
  if (isReduced || !document.startViewTransition) {
    try {
      const result = fn();
      return Promise.resolve({
        finished: Promise.resolve(result),
        updateCallbackDone: Promise.resolve(result),
        ready: Promise.reject(new Error('View Transitions skipped or unsupported')),
        skipTransition: () => {}
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  const tx = document.startViewTransition(fn);
  return Promise.resolve(tx);
}
