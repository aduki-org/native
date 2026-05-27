/**
 * src/core/events/index.js
 *
 * Public event architecture entry point.
 * Aggregates EventBus dispatchers, Shadow-DOM composed delegation, and single-event awaits.
 *
 * Source: doc 10 — Event Architecture §1, §9
 */

import { bus, EventBus } from './bus.js';
import { delegate } from './delegate.js';
import { once } from './once.js';

export const events = {
  emit: (type, detail) => bus.emit(type, detail),
  on: (type, fn, signal) => bus.on(type, fn, signal),
  delegate,
  once
};

export { bus, EventBus, delegate, once };

