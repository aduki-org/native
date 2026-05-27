/**
 * tests/core/workers/pool.test.js
 *
 * Core dedicated worker pool execution test suite.
 *
 * Source: plan.md Phase 6-A, core/workers/pool.js
 */

import { WorkerPool } from '@aduki/native/workers';

describe('Worker Thread Pool', () => {
  let originalWorker;

  before(() => {
    originalWorker = globalThis.Worker;

    // Mock global HTML5 Worker to isolate and assert pool behavior safely offline
    globalThis.Worker = class MockWorker {
      constructor(scriptUrl) {
        this.scriptUrl = scriptUrl;
        this.terminated = false;
      }
      postMessage(msg) {
        const { task, payload, port } = msg;
        // Respond async to simulate thread processing delay
        setTimeout(() => {
          if (port) {
            port.postMessage({
              success: true,
              result: `processed:${task}:${payload}`
            });
          }
        }, 5);
      }
      terminate() {
        this.terminated = true;
      }
    };
  });

  after(() => {
    globalThis.Worker = originalWorker;
  });

  it('should lazy-initialize and run tasks in the worker pool', async () => {
    const pool = new WorkerPool('/mock-worker.js', 2);
    const res = await pool.run('math:square', 5);

    if (res !== 'processed:math:square:5') {
      throw new Error(`Expected result "processed:math:square:5", got "${res}"`);
    }

    pool.terminate();
  });

  it('should schedule tasks according to priority sorting constraints', async () => {
    const pool = new WorkerPool('/mock-worker.js', 1); // single worker to force queueing
    
    // Fill the worker with an active task
    const p0 = pool.run('blocker', 'x');

    const order = [];
    const p1 = pool.run('lowPriority', '1', { priority: 'background' }).then(() => order.push('low'));
    const p2 = pool.run('highPriority', '2', { priority: 'user-blocking' }).then(() => order.push('high'));
    const p3 = pool.run('midPriority', '3', { priority: 'user-visible' }).then(() => order.push('mid'));

    await Promise.all([p0, p1, p2, p3]);

    if (order[0] !== 'high' || order[1] !== 'mid' || order[2] !== 'low') {
      throw new Error(`Expected priorities execution order [high, mid, low], got ${JSON.stringify(order)}`);
    }

    pool.terminate();
  });
});
