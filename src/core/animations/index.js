/**
 * src/core/animations/index.js
 *
 * Public animations base entry point.
 * Combines animation template registries, standard WAAPI triggers, stagger orchestrators,
 * scroll/view-linked timelines, and standard easing curves.
 *
 * Source: doc 03 — Native CSS Architecture §6, doc 12 — Performance §4
 */

import { registry } from './registry.js';
import { animate, stagger } from './play.js';
import { scroll, view } from './scroll.js';
import { Timing, timing, keyframes } from './waapi.js';

export const animations = {
  /**
   * Registers a named animation template with keyframes and defaults.
   */
  register(name, frames, defaultOpts = {}) {
    registry.register(name, frames, defaultOpts);
  },

  animate,
  stagger,
  scroll,
  view,

  // Exposed easing curves and timing utilities
  Timing,
  timing,
  keyframes
};

export {
  registry,
  animate,
  stagger,
  scroll,
  view,
  Timing,
  timing,
  keyframes
};
