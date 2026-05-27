/**
 * tests/core/router/events.test.js
 *
 * Test suite for programmatic events, window-free subscriptions, and handler dynamic resolutions.
 *
 * Source: plan.md §8
 */

import { router } from '../../../src/core/router/index.js';

describe('Router programmatic subscription and handler resolution', () => {
  beforeEach(() => {
    router.clear();
  });

  it('should automatically evaluate and return the resolved tag name on matching', async () => {
    // 1. Tag name directly
    router.register('/direct', 'ui-dashboard');
    // 2. Tag name via function handler
    router.register('/lazy', () => 'ui-lazy');

    const match1 = await router.match('/direct');
    if (!match1 || match1.tag !== 'ui-dashboard') {
      throw new Error(`Expected tag to be "ui-dashboard", got "${match1?.tag}"`);
    }

    const match2 = await router.match('/lazy');
    if (!match2 || match2.tag !== 'ui-lazy') {
      throw new Error(`Expected tag to be "ui-lazy", got "${match2?.tag}"`);
    }
  });

  it('should support registering programmatic event listeners with on', () => {
    let foundCalled = false;
    let notfoundCalled = false;
    let errorCalled = false;

    const unsubFound = router.on('found', () => {
      foundCalled = true;
    });

    const unsubNotFound = router.on('notfound', () => {
      notfoundCalled = true;
    });

    const unsubError = router.on('error', () => {
      errorCalled = true;
    });

    if (typeof unsubFound !== 'function' || typeof unsubNotFound !== 'function' || typeof unsubError !== 'function') {
      throw new Error('Expected on() to return unsubscribe functions');
    }

    unsubFound();
    unsubNotFound();
    unsubError();
  });
});
