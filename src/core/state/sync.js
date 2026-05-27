/**
 * src/core/state/sync.js
 *
 * Cross-tab state synchronization.
 * Leverages native BroadcastChannel to replicate designated state keys
 * between active browser tabs while avoiding update cycles.
 *
 * Source: doc 08 — State Management §11
 */

/**
 * Synchronizes reactive store mutations across multiple active browser tabs.
 */
export function sync(store, keys = [], channelName = 'platform-state-sync') {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return () => {};
  }

  const channel = new BroadcastChannel(channelName);

  // Replicate state mutations to other tabs
  store.onMutation((key, value, source) => {
    if (source === 'local') {
      // Sync only whitelisted keys (or all keys if whitelist is empty)
      if (keys.length === 0 || keys.includes(key)) {
        channel.postMessage({ key, value });
      }
    }
  });

  // Receive replication messages from other tabs
  channel.onmessage = (event) => {
    if (!event.data) return;
    const { key, value } = event.data;

    if (keys.length === 0 || keys.includes(key)) {
      // Apply values with a 'broadcast' source tag to prevent circular replication echo
      store.set(key, value, 'broadcast');
    }
  };

  // Return a cleanup disposer function
  return () => {
    channel.close();
  };
}
