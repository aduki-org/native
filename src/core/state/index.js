/**
 * src/core/state/index.js
 *
 * Public state management namespace.
 * Bundles reactive in-memory stores, lazy derived derivations,
 * cross-tab replications, and transactional IndexedDB persistence.
 *
 * Source: doc 08 — State Management §2, §15
 */

import { ReactiveStore, setActiveSubscriber, getActiveSubscriber } from './store.js';
import { derived } from './derived.js';
import { sync } from './sync.js';
import { storage } from './persist.js';

export const state = {
  create: (initial) => new ReactiveStore(initial),
  derived,
  sync,
  storage
};

export { ReactiveStore, setActiveSubscriber, getActiveSubscriber, derived, sync, storage };


