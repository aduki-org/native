# Multi-Threaded Concurrency Module Documentation

## Purpose and Architectural Position
The `workers` module (`src/core/workers/index.js`) controls asynchronous concurrency. It orchestrates high-performance thread operations by spawning dedicated Web Workers, schedules computationally-intense tasks across a priority-based Dedicated Worker Pool, establishes SharedWorker synchronization corridors, and guarantees cross-context concurrency protection using the Web Locks API.

## Public API Surface with Examples

```javascript
import { workers } from 'lib/core/workers/index.js';

// 1. Run prioritized task in thread pool
const output = await workers.run(
  '/workers/process.js',
  'image:grayscale',
  {
    payload: imgData,
    priority: 'user-blocking' // Runs ahead of background tasks
  }
);

// 2. Mutual exclusion lock synchronization
await workers.lock('db:write', async () => {
  // Safe transactional code guaranteed to execute in isolation across tabs
  await mutateLocalDatabase();
});

// 3. Broadcast channel message subscription
workers.subscribe('chat-updates', (msg) => {
  console.log('New cross-tab message:', msg);
});
```

## AbortSignal and Cleanup Contract
* **Worker Pools**: Pools allocate threads lazily and recycle crash nodes automatically. Invoke `pool.terminate()` to instantly kill execution chains.
* **Locks**: Exclusive blocks support timeouts via AbortSignal limits: `lock(name, fn, { timeout: 1000 })` throws an error if lock acquisition is delayed.

## Known Browser Gaps and Polyfill Strategy
* **Web Locks API**: Missing on old layout engines. The framework falls back to synchronous execution blocks, relying on browser single-threaded nature as security.
* **SharedWorker**: Unsupported on mobile Safari. Connections transparently fall back to fallback dedicated channels or local storage polling if necessary.
