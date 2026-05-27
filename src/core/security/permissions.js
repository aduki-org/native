/**
 * src/core/security/permissions.js
 *
 * Permissions API Facade.
 * Queries, requests, and watches native browser permission changes,
 * implementing AbortSignal-gated status change listeners.
 *
 * Source: doc 15 — Security Architecture §5
 */

/**
 * Queries the browser permission status for a given capability name.
 */
export async function query(permissionName) {
  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    try {
      // Standard descriptor format (some APIs may require additional fields, handled by consumer)
      const status = await navigator.permissions.query({ name: permissionName });
      return status.state; // 'granted' | 'denied' | 'prompt'
    } catch {
      return 'denied';
    }
  }
  return 'denied';
}

/**
 * Subscribes to changes in a specific permission status.
 */
export function watch(permissionName, fn, signal) {
  if (signal?.aborted) return () => {};

  let activeStatus = null;
  const listener = () => {
    if (activeStatus) {
      fn(activeStatus.state);
    }
  };

  const dispose = () => {
    if (activeStatus) {
      activeStatus.removeEventListener('change', listener);
    }
  };

  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    navigator.permissions
      .query({ name: permissionName })
      .then((status) => {
        if (signal?.aborted) return;
        activeStatus = status;
        activeStatus.addEventListener('change', listener);
      })
      .catch((err) => {
        console.warn(`Unable to query permissions watch for "${permissionName}":`, err);
      });
  }

  if (signal) {
    signal.addEventListener('abort', dispose);
  }

  return dispose;
}
