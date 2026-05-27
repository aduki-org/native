/**
 * src/core/router/sync/index.js
 *
 * Facade entry point for router synchronization utilities.
 *
 * Source: plan.md §6
 */

export { setupTabSync } from './tab.js';
export {
  registerConnection,
  coordinateConnections,
  getActiveConnections,
  clearConnections
} from './transport.js';
