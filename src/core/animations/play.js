/**
 * src/core/animations/play.js
 *
 * WAAPI Execution Engine.
 * Wraps browser element.animate(), providing automatic AbortSignal-gated memory-safe
 * cancel cleanups, template resolution, and multi-element stagger calculations.
 *
 * Source: doc 12 — Performance §4, doc 14 — Memory Management §5
 */

import { registry } from './registry.js';

/**
 * Animates a single element, resolving templates and binding AbortSignal cleanups.
 */
export function animate(el, animationInput, options = {}) {
  let keyframes;
  let defaultOpts = {};

  // Resolve template from the registry if name string is provided
  if (typeof animationInput === 'string') {
    const config = registry.get(animationInput);
    if (!config) {
      throw new Error(`Animation template "${animationInput}" not found in registry`);
    }
    keyframes = config.keyframes;
    defaultOpts = config.options;
  } else {
    keyframes = animationInput;
  }

  const finalOpts = { ...defaultOpts, ...options };
  const anim = el.animate(keyframes, finalOpts);

  // Secure against memory leaks: cancel active animation when AbortSignal fires
  if (options.signal) {
    const handleAbort = () => {
      try {
        anim.cancel();
      } catch {}
    };

    options.signal.addEventListener('abort', handleAbort);
    anim.addEventListener('finish', () => {
      options.signal.removeEventListener('abort', handleAbort);
    });
  }

  return anim;
}

/**
 * Animates a sequence of elements with staggered delays.
 */
export function stagger(elements, animationInput, options = {}) {
  const step = options.staggerDelay ?? 60; // default 60ms stagger steps
  const list = Array.from(elements);

  const animations = list.map((el, i) => {
    const itemOpts = {
      ...options,
      delay: (options.delay ?? 0) + i * step
    };
    return animate(el, animationInput, itemOpts);
  });

  return {
    animations,
    /**
     * Instantly aborts all active staggered animations in this group.
     */
    cancel() {
      for (const anim of animations) {
        try {
          anim.cancel();
        } catch {}
      }
    },
    /**
     * Instantly skips all animations to their end state.
     */
    finish() {
      for (const anim of animations) {
        try {
          anim.finish();
        } catch {}
      }
    },
    /**
     * Aggregate promise resolving when all staggered animations settle.
     */
    finished: Promise.all(animations.map((anim) => anim.finished))
  };
}
