/**
 * src/core/offline/queue.js
 *
 * Offline Operations Journal.
 * Manages an IndexedDB-backed task queue to serialize, buffer, and track background
 * tasks when offline, enforcing idempotency keys and retry limits.
 *
 * Source: doc 13 — Offline and Background §5
 */

import { Database } from '../storage/idb.js';

const db = new Database('platform-offline-queue', 1, [
  (dbInstance) => {
    dbInstance.createObjectStore('tasks');
  }
]);

export class OfflineQueue {
  /**
   * Enqueues an offline task with idempotency controls.
   */
  async push(taskName, payload = null, options = {}) {
    await db.open();
    const id = options.idempotencyKey || crypto.randomUUID();

    const item = {
      id,
      task: taskName,
      payload,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: options.maxRetries ?? 5
    };

    await db.set('tasks', id, item);
    return id;
  }

  /**
   * Retrieves all items currently stored in the queue.
   */
  async list() {
    await db.open();
    const list = await db.getAll('tasks');
    // Sort oldest tasks first for chronological processing
    return list.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Updates a task state in the queue.
   */
  async update(task) {
    await db.open();
    await db.set('tasks', task.id, task);
  }

  /**
   * Evicts a resolved task from the queue.
   */
  async delete(id) {
    await db.open();
    await db.delete('tasks', id);
  }

  /**
   * Fully clears the queue.
   */
  async clear() {
    await db.open();
    await db.clear('tasks');
  }
}

export const queue = new OfflineQueue();
