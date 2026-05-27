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
import { setup, addGuard, setNotFound } from './intercept.js';
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
import { renderOutlet } from './outlet.js';

// Auto-bootstrap client-side navigation listeners on client load
if (typeof window !== 'undefined') {
  setup();
}

export const router = {
  // Registration and boundary hooks
  on: register,
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

  // Rendering and match utilities
  render: renderOutlet,
  match
};

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
  renderOutlet,
  // match sub-module
  register,
  match,
  clear,
  getRoutes,
  // intercept sub-module
  addGuard,
  setNotFound,
  setup
};
