/**
 * src/core/ui/index.js
 *
 * Public UI base entry point.
 * Aggregates BaseElement foundations, cooperative task scheduling, transition
 * orchestrators, templates, declarative element factory, and safe reactive element observers.
 *
 * Source: doc 04 — Web Components §1, doc 12 — Performance §2
 */

import { BaseElement } from './base.js';
import { define, element, container } from './define/index.js';
import { schedule, scheduleFrame, yieldTask } from './schedule.js';
import { transition } from './transitions.js';
import { template } from './template.js';
import * as observe from './observe.js';

export const ui = {
  define,
  element,
  container,
  schedule,
  scheduleFrame,
  yield: yieldTask,
  transition,
  template,
  observe
};

export {
  BaseElement,
  define,
  element,
  container,
  schedule,
  scheduleFrame,
  yieldTask,
  transition,
  template,
  observe
};
