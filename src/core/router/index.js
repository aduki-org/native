/**
 * src/core/router/index.js
 *
 * Public client-side routing entry point.
 * Aggregates route definition registry, guards, programmatic traversals,
 * and mounts global onnavigate interception listeners.
 *
 * Source: doc 09 — Routing §1, §2
 */

import { register, match, clear, getRoutes } from './match.js';
import { setup, addGuard, setNotFound, on, nav } from './intercept.js';
import {
  navigate,
  replace,
  back,
  forward,
  go,
  current,
  entries,
  canBack,
  canForward
} from './history.js';

import {
  setupTabSync,
  registerConnection,
  getActiveConnections,
  clearConnections
} from './sync/index.js';

import {
  registerContainer,
  unregisterContainer,
  getContainer,
  clearContainers
} from './container.js';

export const router = {
  // Registration and boundary hooks
  register,
  clear,
  guard: addGuard,
  notFound: setNotFound,

  // Programmatic history API
  navigate,
  replace,
  back,
  forward,
  go,
  current,
  entries,
  canBack,
  canForward,

  match,

  // Event-driven subscription and navigation controllers
  on,
  nav,

  // Synchronization and coordination hooks
  registerConnection,
  getActiveConnections,
  clearConnections,

  // Advanced Container Topology API
  registerContainer,
  unregisterContainer,
  getContainer,
  clearContainers
};

// Auto-bootstrap client-side navigation listeners on client load
if (typeof window !== 'undefined') {
  setup();
  setupTabSync(router);
}

export {
  navigate,
  replace,
  back,
  forward,
  go,
  current,
  entries,
  canBack,
  canForward,

  // match sub-module
  register,
  match,
  clear,
  getRoutes,
  // intercept sub-module
  addGuard,
  setNotFound,
  setup,
  on,
  nav,
  // sync sub-module
  setupTabSync,
  registerConnection,
  getActiveConnections,
  clearConnections,
  // container sub-module
  registerContainer,
  unregisterContainer,
  getContainer,
  clearContainers
};
