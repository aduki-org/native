/**
 * src/core/router/sync/tab.js
 *
 * Cross-tab routing synchronization using BroadcastChannel.
 * Monitors local navigation success events to broadcast route updates,
 * and processes incoming remote broadcasts to keep duplicate tabs in sync.
 *
 * Source: doc 09 — Routing §10, plan.md §6
 */

let isSyncing = false;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('native-router-sync') : null;

/**
 * Bootstraps cross-tab navigation state synchronization.
 */
export function setupTabSync(router) {
  if (!channel || typeof window === 'undefined' || !window.navigation) return;

  channel.onmessage = (event) => {
    const { type, url, state } = event.data || {};
    if (type === 'sync-navigate') {
      const currentUrl = window.navigation.currentEntry?.url;
      if (currentUrl === url) return;

      isSyncing = true;
      const navResult = router.navigate(url, { state });
      
      if (navResult && navResult.finished) {
        navResult.finished.finally(() => {
          isSyncing = false;
        }).catch(() => {});
      } else {
        isSyncing = false;
      }
    }
  };

  window.navigation.addEventListener('navigatesuccess', () => {
    if (isSyncing) return;
    const entry = window.navigation.currentEntry;
    if (entry && entry.url) {
      channel.postMessage({
        type: 'sync-navigate',
        url: entry.url,
        state: typeof entry.getState === 'function' ? entry.getState() : null
      });
    }
  });
}
