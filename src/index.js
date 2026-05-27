/**
 * src/index.js
 *
 * Root public API entry point for the "antigravity" npm package.
 * Re-exports every core module and the elements registry.
 *
 * Usage (after npm install antigravity):
 *   import { ReactiveStore } from 'antigravity/state';
 *   import { api }           from 'antigravity/api';
 *   import { animate }       from 'antigravity/animations';
 */

export * from './core/api/index.js';
export * from './core/state/index.js';
export * from './core/events/index.js';
export * from './core/router/index.js';
export * from './core/storage/index.js';
export * from './core/offline/index.js';
export * from './core/animations/index.js';
export * from './core/workers/index.js';
export * from './core/security/index.js';
export * from './core/ui/index.js';
export * from './core/platform/supports.js';
