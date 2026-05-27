/**
 * tests/core/router/sync.test.js
 *
 * Test suite for tab synchronization and network connection pool coordination.
 *
 * Source: plan.md §8
 */

import {
  registerConnection,
  coordinateConnections,
  getActiveConnections,
  clearConnections
} from '../../../src/core/router/sync/index.js';

describe('Router Sync and Connection Coordination', () => {
  beforeEach(() => {
    clearConnections();
  });

  afterEach(() => {
    clearConnections();
  });

  it('should register connection factories and spawn connections on path match', async () => {
    let connectionOpened = false;
    let targetReceived = null;

    registerConnection('/dashboard/:section', async (url) => {
      connectionOpened = true;
      targetReceived = url;
      return {
        close() {
          connectionOpened = false;
        }
      };
    });

    await coordinateConnections('/dashboard/analytics');

    if (!connectionOpened) {
      throw new Error('Expected background connection to be opened on matching path');
    }
    if (!targetReceived || !targetReceived.pathname.includes('/dashboard/analytics')) {
      throw new Error('Expected factory function to receive the correct destination URL');
    }

    const active = getActiveConnections();
    if (active.size !== 1) {
      throw new Error(`Expected 1 active connection, got ${active.size}`);
    }
  });

  it('should automatically close stale connections when navigating to non-matching paths', async () => {
    let connectionClosed = false;

    registerConnection('/admin/*', async () => {
      return {
        close() {
          connectionClosed = true;
        }
      };
    });

    // 1. Match path
    await coordinateConnections('/admin/users');
    const activeBefore = getActiveConnections();
    if (activeBefore.size !== 1) {
      throw new Error('Expected connection to be active');
    }

    // 2. Navigate away to non-matching path
    await coordinateConnections('/settings');

    if (!connectionClosed) {
      throw new Error('Expected connection to be closed when navigating away');
    }
    const activeAfter = getActiveConnections();
    if (activeAfter.size !== 0) {
      throw new Error('Expected active connections to be cleared');
    }
  });
});
