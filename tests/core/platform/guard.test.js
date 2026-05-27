/**
 * tests/core/platform/guard.test.js
 *
 * Guard feature-gate and dynamic polyfill loading test suite.
 *
 * Source: plan.md Phase 6-A, core/platform/guard.js
 */

import { supports, guard } from '@adukiorg/native/platform';

describe('Platform Guard', () => {
  it('should resolve urlPattern wrapper and expose match capability', async () => {
    const URLPatternClass = await guard.urlPattern();
    if (!URLPatternClass) {
      throw new Error('Expected urlPattern wrapper to resolve to a class/function');
    }

    const pattern = new URLPatternClass({ pathname: '/users/:id' });
    const match = pattern.exec('http://example.com/users/42');
    if (!match || match.pathname.groups.id !== '42') {
      throw new Error('Expected urlPattern matching to work correctly');
    }
  });

  it('should resolve navigation API wrapper', async () => {
    const nav = await guard.navigation();
    if (!nav) {
      throw new Error('Expected navigation wrapper to resolve to an object');
    }
    if (typeof nav.navigate !== 'function') {
      throw new Error('Expected navigation object to expose navigate function');
    }
  });

  it('should resolve popover initializer without errors', async () => {
    // Calling popover() should either use native or install the polyfill.
    // Ensure it resolves cleanly.
    await guard.popover();
  });

  it('should resolve shadow initializer without errors', async () => {
    await guard.shadow(document);
  });

  it('should resolve anchor positioning wrapper', async () => {
    const floatEl = document.createElement('div');
    const anchorEl = document.createElement('div');
    document.body.appendChild(floatEl);
    document.body.appendChild(anchorEl);

    try {
      await guard.anchor(floatEl, anchorEl, { placement: 'bottom-start' });
      // If polyfilled, styles will be set, if native, nothing/native takes care.
      // Verification that it runs without crash is sufficient.
    } finally {
      floatEl.remove();
      anchorEl.remove();
    }
  });

  it('should resolve sanitizer wrapper and return a functional sanitizer', async () => {
    const s = await guard.sanitizer();
    if (!s || typeof s.sanitizeToString !== 'function') {
      throw new Error('Expected sanitizer wrapper to resolve to an object with sanitizeToString');
    }

    const clean = s.sanitizeToString('<div>test</div>');
    if (typeof clean !== 'string') {
      throw new Error('Expected sanitized output to be a string');
    }
  });

  it('should resolve scheduler wrapper and yield task correctly', async () => {
    const scheduler = await guard.scheduler();
    if (!scheduler || typeof scheduler.postTask !== 'function') {
      throw new Error('Expected scheduler wrapper to resolve to an object with postTask');
    }

    let completed = false;
    await scheduler.postTask(() => {
      completed = true;
    });

    if (!completed) {
      throw new Error('Expected scheduled postTask to execute');
    }

    // Verify yield works correctly
    await guard.yield();
  });
});
