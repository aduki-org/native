/**
 * tests/core/events/delegate.test.js
 *
 * Unit tests for high-performance event delegation matches caching.
 */

import { delegate } from '@adukiorg/native/events';

describe('Event Delegation Matches Caching', () => {
  it('should successfully delegate events and cache selector match results', () => {
    const container = document.createElement('div');
    const item = document.createElement('span');
    item.className = 'item';
    container.appendChild(item);
    document.body.appendChild(container);

    let fired = false;
    let matchesCount = 0;

    // Spy on item's matches method
    const originalMatches = item.matches;
    item.matches = function(sel) {
      matchesCount++;
      return originalMatches.call(item, sel);
    };

    const dispose = delegate(container, '.item', 'click', () => {
      fired = true;
    });

    try {
      // First click
      item.dispatchEvent(new CustomEvent('click', { bubbles: true, composed: true }));
      if (!fired) {
        throw new Error('Expected delegated listener to fire');
      }
      if (matchesCount !== 1) {
        throw new Error(`Expected matches to be evaluated once, got ${matchesCount}`);
      }

      // Reset and second click
      fired = false;
      item.dispatchEvent(new CustomEvent('click', { bubbles: true, composed: true }));
      if (!fired) {
        throw new Error('Expected delegated listener to fire a second time');
      }
      // Matches should be cached, so count should still be 1!
      if (matchesCount !== 1) {
        throw new Error(`Expected matches to be cached and NOT evaluated again, got count: ${matchesCount}`);
      }
    } finally {
      dispose();
      item.matches = originalMatches;
      document.body.removeChild(container);
    }
  });
});
