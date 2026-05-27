# Offline Synchronization Module Documentation

## Purpose and Architectural Position
The `offline` module (`src/core/offline/index.js`) drives resilient background sync operations. It hosts IndexedDB-backed task journals, performs debounced, rate-limited HEAD-probes to verify genuine internet access, registers Service Worker Background Sync tags, and establishes messaging corridors with active service worker registrations.

## Public API Surface with Examples

```javascript
import { offline } from 'lib/core/offline/index.js';

// 1. Enqueue task offline with idempotency key
const taskId = await offline.queue.push(
  'post:publish',
  { title: 'Offline Post' },
  { idempotencyKey: 'post-101', maxRetries: 3 }
);

// 2. Connectivity Probe Listener
offline.subscribe((isOnline) => {
  if (isOnline) {
    console.log('Genuine internet access verified! Flushing offline journal...');
  }
});

// 3. Service Worker Direct Messages
await offline.send('sync:flush');
```

## AbortSignal and Cleanup Contract
* **Connectivity Subscriptions**: Always supply an `AbortSignal` inside `offline.subscribe(fn, signal)` to ensure connection probe listeners are unsubscribed when component trees unmount.
* **Queues**: Enqueued items remain in storage until processed or cleared manually, ensuring offline state changes survive tab closures and restarts.

## Known Browser Gaps and Polyfill Strategy
* **Background Sync API**: Leverages standard `registration.sync`. If unsupported (e.g. mobile iOS browsers), the offline coordinator falls back to an offline queue listener that polls for online connection transitions and flushes the queue manually.
* **Navigator Connection**: Relies on HEAD-probe fetch checks to verify actual internet transit, avoiding browser false-positives where `navigator.onLine` returns `true` despite localized Wi-Fi portals.
