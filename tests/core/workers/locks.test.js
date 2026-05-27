/**
 * tests/core/workers/locks.test.js
 *
 * Core Web Locks synchronization execution test suite.
 *
 * Source: plan.md Phase 6-A, core/workers/locks.js
 */

import { lock } from '@adukiorg/native/workers';

describe('Web Locks Synchronization', () => {
  it('should acquire locks and execute callbacks successfully', async () => {
    let executed = false;
    const res = await lock('test:exclusive', async () => {
      executed = true;
      return 'LockReturn';
    });

    if (!executed) {
      throw new Error('Lock callback failed to execute');
    }
    if (res !== 'LockReturn') {
      throw new Error(`Expected "LockReturn", got "${res}"`);
    }
  });

  it('should enforce sequential operational blocks for identical exclusive locks', async () => {
    const active = [];
    const order = [];

    const runLock = async (id, delay) => {
      return lock('test:order', async () => {
        active.push(id);
        if (active.length > 1) {
          throw new Error(`Exclusive lock violated! Active nodes: ${JSON.stringify(active)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        order.push(id);
        active.pop();
      });
    };

    // Run parallel calls
    const p1 = runLock('A', 15);
    const p2 = runLock('B', 5);

    await Promise.all([p1, p2]);

    if (order[0] !== 'A' || order[1] !== 'B') {
      throw new Error(`Expected sequential order [A, B], got ${JSON.stringify(order)}`);
    }
  });

  it('should fail with a timeout error if lock acquisition exceeds threshold limits', async () => {
    // Acquire and hold the lock indefinitely
    const controller = new AbortController();
    let resolveAcquired;
    const pAcquired = new Promise((resolve) => { resolveAcquired = resolve; });
    
    const pHold = lock('test:timeout', async () => {
      resolveAcquired();
      await new Promise((resolve) => {
        controller.signal.addEventListener('abort', resolve);
      });
    });

    // Wait until pHold has actually acquired the lock
    await pAcquired;

    // Try to acquire the held lock with a tight timeout limit
    try {
      await lock('test:timeout', async () => {}, { timeout: 100 });
      throw new Error('Expected lock acquisition to time out');
    } catch (err) {
      if (!err.message.includes('timed out')) {
        throw new Error(`Expected timeout error, got: ${err.message}`);
      }
    } finally {
      controller.abort();
      await pHold;
    }
  });
});
