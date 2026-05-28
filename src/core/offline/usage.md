# Offline & Background Capabilities Usage Guide

This guide details the APIs, best practices, and integration strategies for the offline-first capabilities under `core.offline` and the Service Worker runtime within the `@adukiorg/native` library.

---

## 1. Connectivity Monitoring

The connectivity module coordinates browser status checks and robust network reachability probes. It automatically throttles checks and handles subscription cleanups safely.

### Checking Connectivity

The `check()` function queries network availability. It automatically rate-limits HEAD probes to `/favicon.ico` (once per 10 seconds) to avoid network thrashing, returning a cached result for subsequent calls unless forced.

```javascript
import { check } from '@adukiorg/native/offline';

// Check connectivity with default 10-second throttling
const online = await check();
console.log('Network is:', online ? 'Online' : 'Offline');

// Force an immediate network probe, bypassing rate-limiting
const absoluteOnline = await check(true);
```

### Subscribing to Status Updates

Subscribe to live network status modifications. The subscription returns a disposer callback and integrates a leak-proof `AbortSignal` cleanup.

```javascript
import { subscribe } from '@adukiorg/native/offline';

const controller = new AbortController();

// 1. Subscription with AbortSignal cleanup gating
const dispose = subscribe((online) => {
  if (online) {
    console.log('We are online! Replaying sync buffers...');
  } else {
    console.log('Device went offline. Operations will be journaled.');
  }
}, controller.signal);

// Unsubscribe manually...
dispose();

// ...or abort the controller to automatically clean up all listeners
controller.abort();
```

---

## 2. Persistent Task Queue (`OfflineQueue`)

The offline queue is backed by a transactional IndexedDB store (`platform-offline-queue` / `tasks`). It is chronologically ordered (FIFO) and preserves operation sequence.

### Enqueuing Operations

Write tasks into the queue with optional custom idempotency keys and retry limit parameters.

```javascript
import { queue } from '@adukiorg/native/offline';

// Enqueue a standard API write task
const syncId = await queue.push(
  'post:create',
  {
    url: 'https://api.example.com/posts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { title: 'Native-First Apps', content: 'Building local-first.' }
  },
  {
    // idempotencyKey: 'post-create-999', // OPTIONAL: defaults to an auto-generated crypto.randomUUID()
    maxRetries: 5                       // Maximum revalidation attempts before DLQ transition
  }
);

console.log('Task enqueued with ID:', syncId);
```

### Managing the Queue

Retrieve, update, or evict tasks during custom replication cycles.

```javascript
// List all queued tasks sorted chronologically oldest-first
const tasks = await queue.list();

for (const task of tasks) {
  console.log(`Task: ${task.task}, Attempt: ${task.retries}/${task.maxRetries}`);
  
  if (task.failed) {
    console.warn(`Task permanently failed: ${task.error}`);
    // Evict permanently failing tasks from the queue
    await queue.delete(task.id);
  }
}

// Clear the entire queue
await queue.clear();
```

---

## 3. Background Sync & Fallbacks

The Background Sync Manager leverages browser-native `SyncManager` APIs when running in Chromium, and gracefully falls back to event-driven loops in Firefox and Safari.

### Registering Sync Events

Queue background replay tasks securely. If Background Sync is not supported, it sets up an automatic fallback listener on the window `online` event.

```javascript
import { sync } from '@adukiorg/native/offline';

// Registers a sync event tag
const registeredNative = await sync.register('pending');

if (registeredNative) {
  console.log('Service Worker Background Sync registered.');
} else {
  console.log('Background Sync unsupported. Window-level fallback registered.');
}
```

### Subscribing to Sync Fallback Events

Listen to manual fallback sync events in multi-tab window environments. Features a dual-cleanup memory safety pattern.

```javascript
const controller = new AbortController();

const dispose = sync.onSyncFallback((tag) => {
  console.log(`Sync fallback triggered for tag: ${tag}`);
  // Perform manual client-side queue replay
}, controller.signal);

// Cleanup
dispose();
```

---

## 4. Service Worker Message Bridge

The `bridge` facilitates direct, bidirectional communication between the main window thread and the active Service Worker controller using transferrable `MessageChannel` ports.

```javascript
import { bridge } from '@adukiorg/native/offline';

try {
  // Dispatches action payload directly to the Service Worker controller
  const result = await bridge.send('cache:precache', {
    assets: ['/shell.css', '/assets/logo.svg']
  });
  console.log('SW Action success:', result);
} catch (err) {
  console.error('SW Action failed:', err.message);
}
```

---

## 5. Web Component Lifecycle Integration

The core offline capabilities (`check`, `queue`, `sync`, and `bridge`) are **fully decoupled, modular, and reusable**. You can integrate them into **any custom element, script, worker, or client-side interaction flow** (such as likes, drafts, cart updates, or messaging) whenever the browser is offline.

The `@adukiorg/native` UI elements framework manages standard element lifecycles using declarative `ui.element()` factory definitions. When mounting, the element's `mount({ el, ctrl })` callback receives a unified `AbortController` (`ctrl`) that is automatically aborted when the element disconnects from the DOM.

This ensures zero manual unsubscription boilerplate when hooking up offline checks, task queues, and Background Sync fallbacks inside any UI element.

### Example: Declarative Offline-Enabled Feedback Component

```javascript
import { ui } from '@adukiorg/native/ui';
import { check, queue, sync } from '@adukiorg/native/offline';
import { api } from '@adukiorg/native/api';

ui.element('offline-feedback', {
  template: './feedback.html',
  style: './feedback.css',

  mount({ el, ctrl }) {
    const { signal } = ctrl;
    const form = el.shadowRoot.querySelector('form');

    // 1. Submit hook registered with the lifecycle signal
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = {
        email: el.shadowRoot.querySelector('[name=email]').value,
        comment: el.shadowRoot.querySelector('[name=comment]').value
      };

      // 2. Perform throttled reachability check
      const online = await check();

      if (!online) {
        // 3. Offline: Buffer the task (the queue automatically provisions a secure task UUID)
        const syncId = await queue.push('feedback:submit', data);

        // 4. Register native Background Sync tag
        await sync.register('pending');

        el.dispatchEvent(new CustomEvent('offline-queued', { 
          detail: { syncId, data },
          bubbles: true, 
          composed: true 
        }));
        return;
      }

      // Online: Submit directly to backend using the request signal
      try {
        const res = await api.post('/feedback', data, { signal });
        el.dispatchEvent(new CustomEvent('success', { 
          detail: res,
          bubbles: true, 
          composed: true 
        }));
      } catch (err) {
        el.dispatchEvent(new CustomEvent('error', { 
          detail: err,
          bubbles: true, 
          composed: true 
        }));
      }
    }, { signal });

    // 5. Subscribe to sync fallbacks (for Safari/Firefox) with automated teardown
    sync.onSyncFallback((tag) => {
      if (tag === 'pending') {
        el.dispatchEvent(new CustomEvent('sync-start', { bubbles: true, composed: true }));
      }
    }, signal);
});
```

### Architectural Note: Local Element Events vs. Global API Telemetry

You might wonder: *Since the `core.api` networking layer already broadcasts global telemetry events (like `'failed'`, `'error'`, or `'status:500'`), why are we manually dispatching custom events on the element?*

Both serve distinct, complementary roles in a native-first architecture:

* **Local Element Events (`success`, `error`, `offline-queued`):**
  * **Purpose:** Component Encapsulation and UI Flow Control.
  * **Use Case:** Parent elements embedding the component need to react contextually (e.g., closing a popup modal, routing to a new page, or clearing input states). Local events bubble up natively, letting parent nodes intercept actions cleanly.
* **Global Telemetry Events (API Event Bus):**
  * **Purpose:** Cross-Cutting System Concerns.
  * **Use Case:** Triggering global network connectivity banners, showing unified toast notifications, forcing logouts on `status:401`, or dispatching logs to an analytics endpoint.

**Rule of thumb:** Use **Local Events** for DOM-bound parent-child UI coordination, and leverage **Global Telemetry** for application-wide side effects.

---

## 6. Conflict Resolution & Idempotency Rules

When synchronizing concurrent changes from multiple disconnected clients, follow our core conflict resolution guidelines:

### 6.1. Logical Lamport Clocks

Every offline mutation enqueues logical clocks instead of unstable physical timestamps:

```javascript
const clock = {
  actor: 'device-uuid-1234', // Unique device identifier
  lamport: 42,              // Logical incrementing timestamp
  sequence: 3               // Local sequential operations count
};
```

Compare clock states sequentially:

* Higher `lamport` values win.
* If `lamport` is equal, lexicographically greater `actor` IDs act as deterministic tiebreakers.

### 6.2. CRDT Data Semantics

* **Last-Write-Wins (LWW-Register):** Use for simple field modifications (e.g. updating a user profile name).
* **Observed-Remove (OR-Set):** Use for list mutations (e.g. adding or removing items from a shared playlist/task checklist).
* **Idempotency Keys:** The offline queue **automatically handles and provisions idempotency keys** using secure task UUIDs (`syncId`) by default. During background replication loops, these unique keys are passed in the request payload or standard headers (e.g. `Idempotency-Key`), guaranteeing the API server safely drops any duplicate deliveries without side effects.
