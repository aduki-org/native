# Offline & Background Capabilities Architecture Plan

This document outlines the design, implementation, and optimization specifications for the resilient Offline and Background Capabilities engine under `core.offline` and the Service Worker runtime in the `@adukiorg/native` library.

---

## 1. Architectural Strategy & Core Requirements

Our offline-first architecture rests on the principle that **network absence is a normal mode of operation, not an error state**. The architecture decouples the initiation of an operation from its network execution, guaranteeing consistency, durability, and a highly responsive user experience under any connectivity condition.

### Key Pillars

1. **HEAD-Probe Connectivity Monitor (`connectivity.js`):** Resilient monitoring extending browser `navigator.onLine` with debounced, throttled (10s) HEAD probes using cache-busting headers. Support for memory-safe `subscribe` patterns utilizing the dual-cleanup pattern for `AbortSignal` listeners.
2. **IndexedDB Tasks Journal (`queue.js`):** Chronicled persistent queue leveraging IndexedDB to buffer and serialize background tasks when offline. We will enhance the deserialization module to gracefully stringify plain object payloads when `Content-Type: application/json` is specified, resolving a critical integration mismatch.
3. **Background Sync & Fallback (`sync.js`):** Native `SyncManager` registrations for Chromium-based browsers, paired with immediate event-driven fallbacks on `online` and custom triggers for Firefox and Safari. Memory-safe `onSyncFallback` listener registrations.
4. **Service Worker Message Bridge (`bridge.js`):** High-concurrency message corridors utilizing native `MessageChannel` for direct request/response dispatching to the active Service Worker controller.
5. **FIFO Replay Loop & Dead-Letter Management (`src/sw/sync.js`):** Chronological, sequential task processing with transaction safety, automatic retry limits (max 5), Dead-Letter Queue (DLQ) transitions, and tab-wide success/failure broadcasts.
6. **Conflict Resolution Architecture:** Standardized conflict resolution guidelines using logical Lamport timestamps `(actor_id, lamport_timestamp, sequence_number)` instead of physical wall clocks, supporting Last-Write-Wins (LWW) registers and Grow-Only (G-Set) or Observed-Remove (OR-Set) CRDT configurations.

---

## 2. Component Blueprint & Files Layout

All files inside the offline module strictly adhere to the `RULE[user_global]` lowercase, single-word naming structure:

```
src/core/offline/
├── index.js          # Public offline entry point & unified facade
├── connectivity.js   # Resilient connectivity check and listener subscriptions
├── queue.js          # Persistent IndexedDB offline task journal
├── sync.js           # Chromium Background Sync manager & Safari/Firefox online listeners
├── bridge.js         # Bidirectional MessageChannel Service Worker corridor
└── plan.md           # This planning document
```

---

## 3. Detailed Component Designs

### 3.1. Resilient Connectivity Prober (`connectivity.js`)

* **HEAD Probe with Cache-Busting:** Performs a rate-limited `fetch` request using the `HEAD` method to the local favicon or a health-check path (`/favicon.ico?_probe=Date.now()`) with `mode: 'no-cors'` and `cache: 'no-store'`.
* **Shared In-Flight Promise:** Share single active in-flight check promise to prevent redundant parallel network requests.
* **Leak-Free Dual Abort Cleanup:**

  ```javascript
  export function subscribe(fn, signal) {
    if (signal?.aborted) return () => {};
    listeners.add(fn);
    fn(isOnline);

    const dispose = () => {
      listeners.delete(fn);
      if (signal) {
        signal.removeEventListener('abort', dispose);
      }
    };

    if (signal) {
      signal.addEventListener('abort', dispose, { once: true });
    }

    return dispose;
  }
  ```

### 3.2. Idempotent Offline Queue (`queue.js`)

* **IndexedDB-Backed Buffer:** Uses the `Database` client from `../storage/idb.js` under the store `tasks` inside `platform-offline-queue`.
* **JSON Body Deserialization Fix:** In `src/sw/queue.js` (used during SW replay), if the serialized request `body` is not a string, Blob, or ArrayBuffer (e.g. is a plain object written by `ui-form`), it must be stringified if the header is `application/json`.

  ```javascript
  export function deserializeRequest(serialized) {
    const options = {
      method: serialized.method,
      headers: new Headers(serialized.headers)
    };

    if (serialized.body) {
      const isJson = options.headers.get('content-type')?.includes('application/json');
      if (isJson && typeof serialized.body === 'object' && !(serialized.body instanceof ArrayBuffer) && !(serialized.body instanceof Blob)) {
        options.body = JSON.stringify(serialized.body);
      } else {
        options.body = serialized.body;
      }
    }

    return new Request(serialized.url, options);
  }
  ```

### 3.3. Background Sync & Fallback Coordinator (`sync.js`)

* **Sync API Registration:** Enqueues a sync tag (e.g., `'pending'`) with the browser's Background Sync API if supported.
* **Browser-Safe Event Fallbacks:** Hooks into the window's `online` state on Safari/Firefox and dispatches a custom event (`core:sync-fallback`) detailed with the pending tag.
* **Leak-Free `onSyncFallback`:** Applies the dual-cleanup unsubscription pattern for the `core:sync-fallback` abort listener to prevent memory accumulation in long-lived client tabs.

### 3.4. Service Worker Messaging Corridor (`bridge.js`)

* **Response Channel Routing:** Utilizes transferable `MessageChannel` ports to match worker-side responses back to origin promises, avoiding race conditions in concurrent request dispatching.
* **State Check:** Gracefully rejects with informative errors if the browser does not support Service Workers or if `navigator.serviceWorker.controller` is absent.

---

## 4. Conflict Resolution & Idempotency Guidelines

To resolve concurrent offline edits reliably:

1. **Logical Clocks (Lamport):** Every offline operation writes a tuple `(actor_id, lamport_timestamp, sequence_number)`.
   * `actor_id`: Persisted UUID of the current device.
   * `lamport_timestamp`: Monotonically increasing logical count that advances locally and synchronizes on remote data delivery.
2. **Merge Semantics:**
   * **LWW-Register:** Scalar fields use Last-Write-Wins based on Lamport comparisons (lexicographical actor ID as a final tiebreaker).
   * **G-Set & OR-Set:** Collections (e.g. logs, attachment list mutations) use CRDT merge rules to ensure complete commutative, associative, and idempotent finality.
3. **Idempotency Keys:** Every queued task has an `idempotencyKey` UUID. The replay engine re-submits this key to the server which returns cached responses for duplicates, securing absolute safety across multiple retries.

---

## 5. Verification & Testing Strategy

### 5.1. Automated Unit Testing (`tests/core/offline/`)

We will create a comprehensive suite of unit tests validating the offline capabilities:

1. **`connectivity.test.js`**:
   * Verify rate-limiting and cached status returns within the 10-second window.
   * Assert `subscribe` triggers immediate callback feed.
   * Assert that manual disposal and signal abort both clean up correctly without memory leaks.
2. **`queue.test.js`**:
   * Assert FIFO ordering on `list()`.
   * Assert push and delete operations execute successfully on IndexedDB.
   * Verify that `deserializeRequest` successfully stringifies plain object JSON payloads.
3. **`sync.test.js`**:
   * Verify Background Sync registers successfully if supported.
   * Assert that Safari/Firefox manual online trigger successfully dispatches the `core:sync-fallback` custom event.
   * Assert `onSyncFallback` correctly registers listeners and cleans up its abort hooks seamlessly.
4. **`bridge.test.js`**:
   * Assert that bridge messages throw when controller is absent.

### 5.2. Manual & Network Validation

* Simulating offline states via DevTools and verifying that submissions to `<ui-form>` with the `offline` attribute are correctly buffered inside the IndexedDB queue.
* Verifying that as soon as the network state recovers, the replayer is triggered and sequentially processes tasks, broadcasting `sync-success` events back to the UI element.
