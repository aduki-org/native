/**
 * src/core/workers/pool.js
 *
 * Dedicated Worker Pool.
 * Bounded by hardwareConcurrency - 1 (min 2).
 * Organizes execution via a strict priority queue (user-blocking > user-visible > background)
 * and recycles crashed or unhealthy worker instances automatically.
 *
 * Source: doc 21 — Worker Architecture §3, §4
 */

import { DedicatedWorker } from './dedicated.js';

export class WorkerPool {
  constructor(scriptUrl, size = null) {
    this.scriptUrl = scriptUrl;
    // Bounded by hardwareConcurrency - 1 (min 2)
    this.size = size || Math.max(2, (navigator.hardwareConcurrency || 2) - 1);
    this.workers = [];
    this.queue = [];
  }

  /**
   * Lazy initializes the worker threads.
   */
  #init() {
    if (this.workers.length > 0) return;
    for (let i = 0; i < this.size; i++) {
      this.workers.push({
        instance: new DedicatedWorker(this.scriptUrl),
        busy: false
      });
    }
  }

  /**
   * Queues a task with priority scheduling.
   * Priority levels: 'user-blocking' (2), 'user-visible' (1), 'background' (0)
   */
  run(task, payload = null, options = {}) {
    this.#init();

    const priorityStr = options.priority || 'user-visible';
    const transferables = options.transferables || [];
    const priority =
      priorityStr === 'user-blocking' ? 2 : priorityStr === 'user-visible' ? 1 : 0;

    return new Promise((resolve, reject) => {
      const item = {
        task,
        payload,
        transferables,
        resolve,
        reject,
        priority
      };

      this.queue.push(item);

      // Sort queue in ascending order so the highest priority task sits at the end (pop-efficient)
      this.queue.sort((a, b) => a.priority - b.priority);

      this.#next();
    });
  }

  #next() {
    if (this.queue.length === 0) return;

    // Retrieve the first idle worker in the pool
    const worker = this.workers.find((w) => !w.busy);
    if (!worker) return;

    const taskItem = this.queue.pop();
    worker.busy = true;

    worker.instance
      .run(taskItem.task, taskItem.payload, taskItem.transferables)
      .then(taskItem.resolve)
      .catch((err) => {
        // Recycle the worker instance if it crashed or raised a catastrophic error
        console.warn('Worker instance crash detected. Recycling thread...', err);
        try {
          worker.instance.terminate();
        } catch {}
        worker.instance = new DedicatedWorker(this.scriptUrl);
        taskItem.reject(err);
      })
      .finally(() => {
        worker.busy = false;
        this.#next();
      });
  }

  /**
   * Terminates all pool workers and purges the pending queue.
   */
  terminate() {
    for (const w of this.workers) {
      try {
        w.instance.terminate();
      } catch {}
    }
    this.workers = [];
    this.queue = [];
  }
}
