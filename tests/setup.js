/**
 * tests/setup.js
 *
 * Real Browser Testing Bootstrapper.
 * Purges IndexedDB databases between test runs, verifies browser capabilities,
 * and sets up general mocked services for offline testing.
 *
 * Source: plan.md Phase 6-A, library.md § tests/
 */

// Purge IndexedDB databases to ensure isolated state for every test suite
export async function purgeDatabases() {
  if (typeof indexedDB === 'undefined') return;
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) {
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(db.name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }
}

// Mock standard SW registration response for offline testing environment
export function mockServiceWorkerRegistration() {
  if (typeof navigator === 'undefined') return;

  const mockRegistration = {
    active: {
      postMessage: (msg) => {
        window.dispatchEvent(new MessageEvent('message', { data: msg }));
      }
    },
    unregister: async () => true,
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    writable: true,
    value: {
      register: async () => mockRegistration,
      ready: Promise.resolve(mockRegistration),
      addEventListener: () => {},
      removeEventListener: () => {},
      controller: mockRegistration.active
    }
  });
}
