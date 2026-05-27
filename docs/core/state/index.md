# Reactive State Management Module Documentation

## Purpose and Architectural Position
The `state` module (`src/core/state/index.js`) manages in-memory reactivity. It leverages ES Proxy targets to record property read accesses dynamically (enabling subscription tracking), batches modifications into microtask queues to avoid layout thrashing, persists data through IndexedDB storage, and synchronizes mutations across tabs.

## Public API Surface with Examples

```javascript
import { state } from 'lib/core/state/index.js';

// 1. Initialize Reactive Store
const store = state.create({ count: 0, theme: 'light' });

// 2. Microtask-Batched Mutations
store.subscribe('count', (val) => {
  console.log('Count changed to:', val);
});

store.batch(() => {
  store.set('count', 1);
  store.set('count', 2);
  store.set('count', 3);
}); // Triggers exactly once at the end of the microtask!

// 3. Lazy Derived Value Computations
const isDark = state.derived(() => {
  return store.get('theme') === 'dark';
});

// 4. Cross-Tab State Sync
const disposeSync = state.sync(store, ['theme']);
```

## AbortSignal and Cleanup Contract
* **Subscriptions**: Always pass an `AbortSignal` to `store.subscribe(key, fn, signal)` or use the returned disposer function to clean up callbacks when custom elements disconnect.
* **Derived Values**: Call `.dispose()` on unused derived values to disconnect them from their dependent state stores and avoid memory leaks.
* **Sync Channels**: Call the returned disposer function from `state.sync()` to close the BroadcastChannel connection.

## Known Browser Gaps and Polyfill Strategy
* **ES Proxy / WeakRef**: Core dependencies. These are standard in modern browsers. Legacy fallback support requires a structural fallback mapping state properties manually.
* **BroadcastChannel**: If unavailable (e.g. private browsing mode), the sync module gracefully skips cross-tab messaging.
