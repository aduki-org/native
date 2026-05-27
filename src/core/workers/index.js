/**
 * src/core/workers/index.js
 *
 * Public workers entry point.
 * Aggregates dedicated, pooled, shared, broadcast, locking, and offscreen canvas wrappers
 * into a single unified public thread gateway.
 *
 * Source: doc 21 — Worker Architecture §1, §3
 */

import { DedicatedWorker } from './dedicated.js';
import { WorkerPool } from './pool.js';
import { SharedConnection } from './shared.js';
import { broadcast } from './broadcast.js';
import { lock } from './locks.js';
import { offscreen, OffscreenHandle } from './offscreen.js';

const pools = new Map();

export const workers = {
  /**
   * Runs a prioritized CPU-bound task in a dynamically allocated thread pool.
   */
  run(scriptUrl, task, opts = {}) {
    if (!pools.has(scriptUrl)) {
      pools.set(scriptUrl, new WorkerPool(scriptUrl));
    }
    return pools.get(scriptUrl).run(task, opts.payload, opts);
  },

  /**
   * Initializes and connects to a SharedWorker instance.
   */
  shared(scriptUrl, name) {
    const connection = new SharedConnection(scriptUrl, name);
    connection.connect();
    return connection;
  },

  /**
   * Executes a transaction callback holding a concurrency lock.
   */
  lock,

  /**
   * Sends a BroadcastChannel payload.
   */
  broadcast(channel, msg) {
    broadcast.broadcast(channel, msg);
  },

  /**
   * Subscribes to BroadcastChannel payloads.
   */
  subscribe(channel, fn, signal) {
    return broadcast.subscribe(channel, fn, signal);
  },

  /**
   * Transfers context control from a DOM canvas to a worker thread.
   */
  offscreen
};

export {
  DedicatedWorker,
  WorkerPool,
  SharedConnection,
  broadcast,
  lock,
  offscreen,
  OffscreenHandle
};
