/**
 * src/core/router/transitions.js
 *
 * Safe wrapper for the browser's CSS View Transitions API.
 * Animates page updates off-thread via GPU screenshots when available,
 * falling back instantly to standard synchronous rendering when unsupported.
 * Supports dynamic shared-element morphing via transient viewTransitionName assignment.
 *
 * Source: doc 09 — Routing §8, plan.md §5
 */

export const transitions = {
  /**
   * Wraps a DOM modification callback in a view transition.
   * Supports transient shared element morphing.
   */
  async run(updateDOM, options = {}) {
    const { sourceElement, name = 'selected-item' } = options;

    if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
      const hasSource = sourceElement && sourceElement instanceof HTMLElement;
      if (hasSource) {
        sourceElement.style.viewTransitionName = name;
      }

      const transition = document.startViewTransition(async () => {
        await updateDOM();
      });

      if (hasSource) {
        // Clean up the transient style as soon as transition completes or fails
        transition.finished.finally(() => {
          sourceElement.style.viewTransitionName = '';
        });
      }

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
