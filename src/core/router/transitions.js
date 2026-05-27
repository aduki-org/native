/**
 * src/core/router/transitions.js
 *
 * Safe wrapper for the browser's CSS View Transitions API.
 * Animates page updates off-thread via GPU screenshots when available,
 * falling back instantly to standard synchronous rendering when unsupported.
 *
 * Source: doc 09 — Routing §8
 */

export const transitions = {
  /**
   * Wraps a DOM modification callback in a view transition.
   */
  async run(updateDOM) {
    if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
      const transition = document.startViewTransition(updateDOM);
      try {
        await transition.finished;
      } catch (err) {
        // Silence aborted/superseded view transition errors to preserve router stability
        console.warn('View Transition was aborted or failed:', err);
      }
    } else {
      // Graceful fallback for non-supporting browsers (e.g. Safari < 18, Firefox < 133)
      await updateDOM();
    }
  }
};
