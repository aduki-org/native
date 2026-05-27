## Offline and Background Capabilities

**Spec Authority:** WHATWG HTML Living Standard — Service Worker · WICG Background Sync · WICG Periodic Background Sync · W3C Push API · IETF RFC 8292 — VAPID  
**MDN References:** Service Worker API · Background Synchronization API · Push API · Periodic Background Sync API · NavigationPreloadManager  
**Baseline Status:** Service Worker — Widely Available · Navigation Preload — Widely Available · Background Sync — Chromium-only (Firefox disabled; Safari unimplemented) · Push API — Widely Available (Safari 16.4+) · Periodic Background Sync — Chromium + installed PWA only

---

## Design Principles for the Offline Engine

Offline capability is not a feature that is added to an application. It is an architectural property of the application's data and request handling model. An application built online-first that degrades gracefully when the network disappears is fundamentally different from — and inferior to — an application built offline-first that enhances when the network is available.

**Network absence is not an error state.** The system does not treat a failed network request as an exceptional condition. It is an expected mode of operation. Operations queued during offline periods are not "pending errors" — they are deferred successful operations that have not yet been confirmed by a remote system.

**The Service Worker is a permanent infrastructure layer, not a caching convenience.** It runs independently of open tabs, intercepts every network request, and is the only web platform mechanism that enables background operation after the user has left the application. Its scope and purpose extend far beyond caching: it is the offline engine's process boundary.

**The application layer must not manage connectivity state.** Components write to IndexedDB and register sync events. The Service Worker observes the network and executes queued operations when connectivity permits. The separation of concerns — application layer produces operations, Service Worker delivers them — eliminates an entire class of timing bugs where components attempt to directly manage retry logic, connectivity polling, and request re-execution.

**Every background operation must be idempotent.** Operations that survive across sessions, browser restarts, and device reboots can be replayed by the platform. If replaying an operation twice produces a different result than replaying it once, the operation is not safe to queue. Idempotency is the prerequisite for all offline operation queuing.

**Fallbacks for unsupported APIs are first-class, not afterthoughts.** Background Sync does not exist in Firefox or Safari. Periodic Background Sync exists only in Chromium on installed PWAs. Any feature that uses these APIs must ship with a complete fallback path that delivers an acceptable experience without them.

---

## Service Worker Architecture

### The Service Worker as Execution Context

The Service Worker runs in a `ServiceWorkerGlobalScope` — an isolated execution context separate from both the main thread and any dedicated workers. It has no access to the DOM, no `window` object, and no `localStorage`. It does have access to `fetch()`, `caches` (the Cache API), `clients` (the controlled browsing contexts), `IndexedDB`, the Push API, and Background Sync. It persists independently of any open tab: the browser may terminate a Service Worker that is idle and restart it when needed, with an event-driven activation model.

The Service Worker is registered once per origin. Its scope — the set of URLs whose fetch events it intercepts — defaults to the directory of the Service Worker script file. The scope can be narrowed but not expanded beyond the script's location.

### Full Lifecycle

#### Registration

`navigator.serviceWorker.register('/sw.js')` submits the Service Worker script for installation. The browser fetches the script, parses it, and begins the installation phase. Registration is asynchronous and returns a `Promise<ServiceWorkerRegistration>`. The registration object is the control plane for the Service Worker: it exposes `update()`, `unregister()`, `active`, `installing`, `waiting`, and the Background Sync and Push subscription interfaces.

Registration should occur after the first meaningful paint — not in `<head>` — to avoid consuming bandwidth and CPU during critical page load.

#### Installation

The `install` event fires in the Service Worker global scope when the browser first evaluates the script (or re-evaluates a changed version). The install handler is the correct place to pre-cache the application shell: the minimum set of HTML, CSS, and JavaScript required to render any route. `event.waitUntil()` accepts a Promise; the Service Worker remains in the installing state until that Promise settles. If the Promise rejects, the installation fails and the Service Worker is discarded. The browser will try again on the next page load.

Pre-caching during install must be conservative. Assets that are not critical for offline rendering of any route should not be pre-cached; they inflate installation time, increase quota consumption, and can cause installation failures if a single asset request fails. Non-critical assets are cached lazily during their first runtime request.

#### Waiting

A newly installed Service Worker does not activate immediately if a previous version is controlling any open tab. It enters the waiting state, remaining installed but not active. This prevents two incompatible versions of the application from running simultaneously — an old tab using an old cache, a new tab using a new cache — which would produce undefined behaviour for any shared state (IndexedDB records, for example, where a schema migration has run under the new Service Worker).

Two resolution paths exist:

**User-driven activation** — The application detects the waiting Service Worker via the `updatefound` event on the registration and the `installing` state on the new worker. It presents a non-blocking notification to the user: "A new version is available — reload to update." The user reloads, all old tabs close, and the new Service Worker activates on the next navigation. This is the safest update strategy: it guarantees no user is mid-session when the version change occurs.

**Forced activation via `skipWaiting()`** — Calling `self.skipWaiting()` in the install handler instructs the new Service Worker to activate immediately, bypassing the waiting phase. Combined with `clients.claim()` in the activate handler, the new Service Worker takes control of all open tabs instantly. This approach risks breaking in-flight operations on existing tabs if the new version's caching, routing, or data model is incompatible with the old version. It is appropriate for critical bug fixes. It is inappropriate for feature releases involving cache structure changes.

The `updateFound` event fires on the `ServiceWorkerRegistration` whenever the browser installs a new Service Worker. The `navigator.serviceWorker.controller` changes when the active controller is replaced. The `controllerchange` event on `navigator.serviceWorker` fires when this happens, allowing the main thread to react to an in-session activation.

#### Activation

The `activate` event fires when the Service Worker takes control. This is the correct location for two operations: cleaning up stale caches from previous versions, and optionally calling `self.clients.claim()`.

**Cache cleanup** — The `caches.keys()` method returns all named caches for the origin. Any cache whose name does not match the current version string (embedded in the Service Worker's constants at build time) is a stale cache from a previous deployment and must be deleted. This is the mechanism by which outdated cached assets are purged; without it, old versions accumulate and consume quota.

**`clients.claim()`** — Without this call, the active Service Worker does not control tabs that loaded before it became active. On first visit, the Service Worker installs and activates, but the current page's fetch events are not intercepted — only subsequent navigations. `clients.claim()` retroactively claims control of all matching open tabs. This is correct for first-activation scenarios where the application needs immediate offline capability. For version-update activations combined with `skipWaiting()`, it immediately replaces the old controller on all open tabs.

#### Fetch Interception

The `fetch` event fires for every network request from a controlled page that matches the Service Worker's scope. The `event.respondWith()` method intercepts the request and provides a custom `Response`. If `respondWith()` is not called, the request falls through to the network as if no Service Worker were present.

The fetch handler is the implementation point for all caching strategies. It must be synchronous in deciding whether to call `respondWith()` — the decision cannot be deferred across an `await`. The Promise passed to `respondWith()` may be asynchronous, but the decision to intercept must be synchronous.

`event.request` exposes the full `Request` object: URL, method, headers, mode, credentials. The `event.request.mode === 'navigate'` check identifies HTML navigation requests (top-level page loads and iframe loads), distinguishing them from API calls and asset fetches. Navigation requests are candidates for Navigation Preload.

#### Service Worker Updates

The browser checks for an updated Service Worker script automatically after every navigation to a controlled page, and at minimum every 24 hours. If the script has changed by even one byte, the new version is installed. `registration.update()` forces an immediate check — called on an hourly `setInterval` for long-lived applications where the user may not navigate for hours.

The Service Worker script must be served with `Cache-Control: no-store` or a short `max-age`. Service Worker scripts are not subject to the standard browser HTTP cache during the update check, but misconfigured servers can cause the browser to serve a stale Service Worker script, which blocks updates from deploying.

### Navigation Preload

**MDN:** `developer.mozilla.org/en-US/docs/Web/API/NavigationPreloadManager`  
**Baseline:** Widely Available

Service Worker startup time — the delay between a navigation request and the Service Worker becoming ready to handle its `fetch` event — ranges from approximately 50ms on fast desktop devices to 250–500ms on slow or CPU-throttled mobile devices. For applications that serve HTML navigation responses from the network (rather than a pre-cached shell), this startup time adds directly to Time to First Byte.

Navigation Preload eliminates this penalty by starting the navigation network request in parallel with Service Worker startup. The browser sends the navigation request immediately when the navigation occurs, regardless of whether the Service Worker is ready. When the Service Worker's `fetch` event handler executes, `event.preloadResponse` resolves to the in-flight (or completed) preloaded response.

Navigation Preload is enabled in the `activate` handler via `registration.navigationPreload.enable()`. The fetch handler consults `event.preloadResponse` before falling back to a cache lookup or network fetch. When the preloaded response is available, it is used directly; the Service Worker adds no latency to the navigation at all. Navigation preload adds a `Service-Worker-Navigation-Preload` header to the preloaded request, which the server can use to return a reduced response (navigation-only content, without a full page shell) — optimising bandwidth for routes where the shell is pre-cached separately.

Navigation Preload is not appropriate for applications that serve all navigation responses from a pre-cached app shell. In that case, the cached shell response is served instantly without a network round-trip, and any preloaded response is unused and wasted.

---

## Caching Strategy Reference

Each resource category in this architecture uses a defined caching strategy. The strategy is declared in the Service Worker's fetch handler and applied per URL pattern match.

### Cache-First (Application Shell and Versioned Assets)

The cache is consulted first. On a hit, the cached response is returned immediately without any network activity. On a miss, the network is consulted, the response is stored in the named cache, and then returned. No network request ever competes with a cache hit.

This strategy is appropriate for: the application shell HTML (the single document that bootstraps the SPA); CSS bundles; core JavaScript modules; fonts; icons; and any asset identified by a content-hash in its URL (where the URL changes when content changes). These assets change only on deployment. Cache invalidation is handled by the Service Worker update lifecycle — a new deployment installs a new Service Worker, which caches a new set of assets under a new versioned cache name, and deletes the old cache on activation.

The cache-first strategy eliminates network latency for returning users on all assets it covers. For a well-structured application shell, this means that the primary UI scaffolding renders with zero network activity after the first visit.

### Network-First with Cache Fallback (API Responses and Dynamic Documents)

The network is consulted first. On a successful response, the response is cloned and stored in cache before being returned to the caller. On a network failure — timeout, DNS failure, offline — the cache is consulted for a fallback response. If no cached fallback exists, a pre-cached offline fallback page is returned.

For API responses, a configurable timeout is applied to the network leg. If the network does not respond within the timeout (typically 3–5 seconds), the cache fallback is used immediately rather than waiting for a slow network to eventually respond. This prevents the strategy from degrading into an unbounded wait under poor connectivity.

This strategy is appropriate for: JSON API endpoints that return data the user expects to be current; authenticated routes where stale data is preferable to an error; and any document where freshness is important but offline access is also required.

### Stale-While-Revalidate (Content and Semi-Frequently Updated Resources)

The cache is served immediately for the fastest possible response. Simultaneously, a network request is sent to revalidate the cache entry. On the next request for the same resource, the freshened version is served. The current request always receives the cached version, even if it is stale; it never waits for the network.

This strategy is appropriate for: navigation menus; user profiles; product catalogues; blog posts; documentation pages; and non-critical API responses where one-request-behind staleness is acceptable. It delivers the lowest perceived latency of any strategy that also keeps content fresh over time.

A variant — **Cache-Then-Network** — extends this by delivering the cached response immediately and then delivering the network response as a second update, if it differs. The application layer explicitly handles both responses, re-rendering when the fresh network response arrives. This is appropriate for dashboards and feed views where it is acceptable (and expected) to show cached data immediately and then update the view when fresh data loads.

### Offline Fallback

For navigation requests that miss both the network and the cache, a pre-cached offline fallback document is returned. The offline fallback is a minimal HTML document that acknowledges the offline state, shows the application shell (for visual continuity), and presents any locally available data. It does not display a browser error page. The fallback is stored during the install phase and is never cleared.

---

## Connectivity Detection

### navigator.onLine: Signal, Not Guarantee

`navigator.onLine` returns a boolean indicating whether the browser believes it is connected to a network. The `online` and `offline` events on `window` fire when this value changes.

`navigator.onLine` returning `false` is reliable — the device is definitely offline. `navigator.onLine` returning `true` is unreliable — it means the device is connected to some network (a router, a LAN, a VPN interface) but makes no assertion about internet reachability or server availability. A device behind a captive portal, or connected to a LAN with no upstream routing, or connected to a VPN that is not routing to the application server, will show `navigator.onLine === true` while being functionally offline from the application's perspective.

The `online` and `offline` events are the correct trigger for initiating or suspending sync queue processing in the manual retry fallback. They are not sufficient alone for determining operational connectivity.

### Reachability Probing

For operations that require confirmed connectivity before proceeding — initiating a sync replay, displaying an "Online" status indicator — a lightweight HTTP probe verifies actual reachability:

```
HEAD /health-check?t={timestamp}
Cache-Control: no-store
```

The request is sent to a known endpoint on the application's own origin. `cache: 'no-store'` bypasses the Cache API, ensuring the response comes from the network. A successful `200` response confirms end-to-end connectivity. Failure — network error, timeout, non-2xx — confirms unreachability regardless of `navigator.onLine`.

The probe is rate-limited: it does not fire more than once per 10 seconds regardless of how many components request a connectivity check simultaneously. The result is debounced and shared across all requesters via an event.

### Connectivity State in the Application

The application maintains a single connectivity status — `'online'`, `'offline'`, or `'unknown'` — derived from the combination of `navigator.onLine` and periodic probe results. This status is published on the application event bus and subscribed to by components that need to adapt their UI or behaviour to connectivity state. No component observes `navigator.onLine` or the window `online`/`offline` events directly.

---

## Background Sync Architecture

**Spec:** WICG Background Synchronization  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API`  
**Browser Support as of 2026:** Chrome, Edge, Opera, Samsung Internet — full support. Firefox — implemented but disabled by default. Safari (macOS, iOS, iPadOS, including Safari 26) — unimplemented. A complete manual retry fallback is always required.

### Conceptual Model

Background Sync decouples the initiation of an operation from its execution. When a user performs an action that requires a network request — submitting a form, sending a message, creating a record — the action is considered complete from the user's perspective immediately. The data is written to IndexedDB. A sync event is registered with the Service Worker. The browser takes responsibility for delivering the operation when connectivity is available, even if the user closes the tab, closes the browser, or restarts the device.

This model eliminates the entire class of "waiting for the network" UX: the application never shows a spinner for user-initiated operations. All network delivery is background infrastructure.

### Operation Queue Architecture

The sync queue is a dedicated IndexedDB object store (`sync_queue`, defined in the storage layer). Each entry records:

- A unique idempotency key (UUID) assigned at creation
- The operation type (`create`, `update`, `delete`)
- The entity type and entity ID
- The serialised operation payload
- The timestamp the operation was queued (`queued_at`)
- The number of replay attempts (`retry_count`)
- The device identifier and logical timestamp (for conflict resolution)

Entries are appended on user action, never removed until the operation has been confirmed by the server. If the user creates a record offline and then deletes it before reconnecting, both operations exist in the queue and both are replayed in order — which is the correct behaviour. The server sees a create followed by a delete, achieving the correct final state.

The queue is ordered by `queued_at`. Replay is always sequential (FIFO within a single session's operations) to preserve causality. Operations from a single session must reach the server in the order they were initiated.

### Service Worker Sync Handler

The `sync` event fires in the Service Worker when the browser determines that connectivity has been restored and the registered sync tag has a pending event. The handler reads the queue from IndexedDB, processes each entry in order, and removes entries for which the server returns a success response (2xx). If a request fails with a non-idempotent server error (4xx), the entry is removed and the error is reported. If a request fails with a transient server error (5xx) or a network error, the entry is retained and the sync event handler rejects its Promise, signalling to the browser that it should retry the sync event later with exponential backoff.

The browser enforces a maximum retry window for Background Sync events. After a browser-defined number of retries (typically three days in Chrome), the browser stops firing the sync event. The queue entry remains in IndexedDB; the application must surface a manual retry prompt if the operation has exceeded the retry window.

`event.lastChance` is a boolean on the sync event object that is `true` when this is the browser's final retry opportunity. When `lastChance` is `true`, the handler must decide whether to attempt delivery (and accept that failure means permanent loss) or to surface the operation to the user for manual action.

### Manual Retry Fallback (Firefox, Safari, and all non-Chromium browsers)

The manual retry path implements equivalent semantics without the Background Sync API. It is active concurrently with Background Sync — not as a replacement — so that the application behaves correctly on all browsers:

1. On the `online` window event, the connectivity reachability probe is triggered.
2. On confirmed reachability, the `sync_queue` object store is read from IndexedDB.
3. Entries are replayed in `queued_at` order, with exponential backoff on transient failures.
4. The retry loop runs inside a Web Lock (`"storage:write:sync-queue"`) to prevent concurrent replay across tabs.

The manual retry differs from Background Sync in one critical dimension: it requires the tab to be open. Operations queued during an offline period on a Firefox or Safari browser are delivered on the next session where the application tab is open and connectivity is confirmed. For most applications, this is an acceptable degradation — the user is likely to open the application when they reconnect. Applications with strict delivery guarantees (financial transactions, medical records) must acknowledge this limitation in their design.

---

## Push API and VAPID Architecture

**Spec:** W3C Push API · IETF RFC 8292 — VAPID  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Push_API`  
**Baseline:** Widely Available (Safari 16.4+ — full support; all major browsers as of 2023)

### Conceptual Architecture

Web Push enables server-initiated messages delivered to the browser, even when no tab of the application is open. The delivery path has three parties:

**Application Server** — Holds the VAPID private key and the user's push subscription endpoint. Initiates push messages using the HTTP Web Push protocol (RFC 8030).

**Push Service** — A browser-vendor-operated relay (Google's FCM for Chrome, Mozilla's Push Service for Firefox, Apple's APNs for Safari). The application server posts encrypted messages to the push service endpoint. The push service delivers the message to the browser when the browser is reachable, regardless of whether the browser is actively using the application.

**Service Worker** — Receives the `push` event when a message arrives. It handles the event, typically by displaying a notification via `registration.showNotification()`, and uses `event.waitUntil()` to keep the Service Worker alive until the notification is shown.

### VAPID Authentication

VAPID (Voluntary Application Server Identification, RFC 8292) provides a mechanism for the application server to prove its identity to the push service, preventing unauthorized parties from sending messages to a user's push subscription. The application server generates a public/private ECDSA key pair. The public key is provided to the browser during subscription. The private key is used on the server to sign JWT tokens accompanying each push request to the push service.

The VAPID key pair is generated once per application deployment and stored securely on the server. The public key is exposed to the client as an application constant. It must not be rotated without coordinating subscription migration; changing the VAPID public key invalidates all existing subscriptions.

### Subscription Lifecycle

**Permission request** — `Notification.requestPermission()` must be called in response to a user gesture. Requesting permission without user initiation (on page load, without prior context) is a known pattern that results in high denial rates. The correct UX is to provide context first — explain what notifications will contain and their value — then request permission after the user expresses intent.

**Subscription creation** — `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey })` creates a push subscription. `userVisibleOnly: true` is required in all browsers; it asserts that every push message will result in a notification visible to the user. Silent push (no visible notification) is not permitted by any major browser.

The subscription object contains: an `endpoint` URL (unique per browser per subscription — this is the push service URL the server posts to), and `keys` containing the `p256dh` public key and `auth` secret used to encrypt message payloads. Payload encryption is required for any message containing user data; unencrypted pushes send no payload.

**Subscription persistence** — The subscription object is sent to the application server immediately after creation and stored server-side against the user's account. On the client side, the current subscription is also stored in IndexedDB for comparison on subsequent sessions. On each application load, the current subscription is fetched via `registration.pushManager.getSubscription()` and compared to the server-stored subscription. Mismatches (subscription rotated by the browser) trigger re-registration.

**Subscription expiry** — Push subscriptions can expire or be revoked by the browser (on permission revocation, on browser reinstall, on clearing site data). The server receives a `410 Gone` response when attempting to push to an expired subscription. The server must handle `410` by deleting the subscription record. Failing to do so causes accumulation of dead subscriptions and delivery failures.

### Push Event Handler

The Service Worker's `push` event handler receives the message, decrypts the payload (handled transparently by the browser — the Service Worker receives the decrypted data via `event.data`), and calls `self.registration.showNotification()`. The notification includes: `title`, `body`, `icon`, `badge`, `data` (arbitrary JSON attached to the notification for use in the click handler), `actions` (up to two notification action buttons), and `tag` (deduplications key — notifications with the same tag replace each other rather than stacking).

The `notificationclick` event fires when the user taps the notification. The handler focuses an existing client tab if one is open, or opens a new tab navigating to the relevant route derived from `event.notification.data`. `clients.openWindow()` and `clients.matchAll()` are the relevant APIs.

**Silent handling** — Not all push messages require visible notifications. Some push messages carry data payloads intended to update the application's IndexedDB cache in the background (content freshness updates, invalidation messages). If the tab is open and active, the Service Worker posts the update to the client via `clients.matchAll()` and `client.postMessage()` rather than showing a notification. The notification is suppressed, and the client re-renders from the updated local data.

---

## Conflict Resolution Architecture

Offline writes are inherently concurrent with writes from other devices or users that occurred while a device was disconnected. The system must define deterministic resolution strategies — not leave conflicts as undefined state.

### Logical Clocks, Not Wall Clocks

Physical clock timestamps (JavaScript's `Date.now()`) cannot be used as the primary ordering mechanism for distributed writes. Clock drift between devices, NTP synchronisation delays, and the inability to establish causal ordering from physical timestamps alone make wall-clock comparison unreliable as a conflict resolution tiebreaker. The system uses **Lamport timestamps** — monotonically increasing logical clocks that advance on every operation and synchronise to the maximum observed value on receipt of any message from another actor. Lamport timestamps establish causal ordering: if operation A happened before operation B in the same actor, A's timestamp is strictly less than B's.

Each pending operation in the sync queue records: the originating device's **actor ID** (a UUID assigned on first install, persisted in IndexedDB), the **Lamport timestamp** at the time of the operation, and the **sequence number** (a per-actor monotonic counter). Together, `(actor_id, lamport_timestamp, sequence_number)` uniquely identifies every operation across all devices and establishes a total ordering.

### Last-Write-Wins (LWW) for Scalar Fields

For scalar fields — strings, numbers, booleans, enumerations — the write with the highest Lamport timestamp wins. If two operations have the same Lamport timestamp (a genuine concurrent write where both clocks have the same value), the actor ID is used as a deterministic tiebreaker (lexicographic comparison). This ensures every device reaches the same conclusion independently, without coordination.

LWW is appropriate for: user preferences, profile fields, settings, document metadata, and any field where the semantics of the application tolerate one concurrent write superseding another. LWW silently discards the losing write. Applications that cannot tolerate data loss for any write must not use LWW; they must use CRDT semantics.

### CRDT Semantics for Concurrent Edits

For data where concurrent edits from multiple actors must all be preserved — collaborative text documents, shared lists, comment threads — Last-Write-Wins produces data loss. Conflict-free Replicated Data Types (CRDTs) are data structures where any two states can be deterministically merged, regardless of the order in which operations are applied, producing the same final state on all devices.

CRDT types used in this architecture:

**G-Set (Grow-only Set)** — Elements can be added but never removed. Merge is union. Appropriate for append-only collections (activity logs, read receipts, audit trails).

**OR-Set (Observed-Remove Set)** — Supports both add and remove operations. Each add operation is tagged with a unique ID; removal tombstones the specific add tag rather than the element value. Concurrent add and remove of the same element is resolved in favour of add (the removal only removes the specific observed add). Appropriate for user-managed collections, bookmark sets, tag lists.

**LWW-Register** — A single-value register where the write with the highest logical timestamp wins. Equivalent to LWW for scalar fields, with the benefit of CRDT merge semantics (commutative, associative, idempotent). Appropriate for scalar fields in documents where merge correctness is required.

**Sequence CRDT (RGA or YATA variant)** — For ordered text and list sequences where concurrent insertions must both be preserved and positioned consistently. Each character or list element is assigned a unique stable identity. Concurrent insertions are resolved to a consistent total order using the originating actor ID and Lamport timestamp. This is the foundation of collaborative rich-text editing. Its implementation complexity is substantial and it is only warranted for explicitly collaborative document features.

The choice between CRDT types is made at the **data model level**, not at the application layer. Each field in the data model declares its merge semantics. The sync engine applies the declared merge strategy when reconciling offline writes with the server's canonical state.

### Idempotency and Replay Safety

Every operation in the sync queue carries a UUID idempotency key. The server stores the most recent N idempotency keys per user (with a configurable retention window, typically 48 hours). On receiving an operation, the server checks the idempotency key against its cache. If the key is already present, the operation is a replay and the server returns the original response without re-executing the operation. This makes replaying the entire sync queue safe — the server produces the same state regardless of how many times the queue is replayed.

Operations that cannot be made idempotent by design — for example, operations with inherently side-effect-triggering business logic — must not be queued in the Background Sync queue. They must require confirmed network connectivity before execution.

---

## Periodic Background Sync

**Spec:** WICG Web Periodic Background Synchronization  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API`  
**Browser Support:** Chrome 80+ and Edge — full support, installed PWA required. Firefox — unimplemented. Safari — unimplemented.

### Conceptual Model

Periodic Background Sync enables the Service Worker to run on a browser-chosen schedule — not a developer-defined one — to perform content freshness operations. The browser decides when to fire `periodicsync` events based on: device network conditions (events only fire on good connectivity), device battery state, the site's engagement score (how frequently the user visits and interacts), and the `minInterval` declared at registration time.

Critically, the browser treats `minInterval` as a lower bound, not a target. A site with low engagement may have its periodic sync fired far less frequently than `minInterval` — or not at all. Chrome uses an internal site engagement score (viewable at `about://site-engagement`) to determine sync frequency. A score of zero prevents periodic sync from firing.

Periodic Background Sync fires the `periodicsync` event in the Service Worker, even when no tab of the application is open. The handler typically fetches fresh content from the network and stores it in the Cache API, so that the next time the user opens the application, fresh data is available without any network wait.

### Registration Requirements

Registration requires:

- An installed PWA (the application must have a `manifest.json` and be installed via the browser's "Add to Home Screen" or PWA install prompt)
- The `periodic-background-sync` permission being granted (checked via `navigator.permissions.query({ name: 'periodic-background-sync' })`)
- An active service worker registration
- `navigator.serviceWorker.ready` to have resolved before `registration.periodicSync.register()` is called

Each tag represents a distinct sync category. Multiple tags can be registered with different `minInterval` values: `'update-articles'` with a 24-hour interval, `'refresh-config'` with a 6-hour interval.

### Fallback Strategy

For Firefox and Safari, and for Chromium users who have not installed the PWA, periodic freshness is achieved through alternative mechanisms:

**On application open** — When the application loads, a content freshness check runs immediately and in parallel with rendering. The check fetches a lightweight "last-modified" sentinel from the server (a single JSON endpoint returning a timestamp). If the sentinel indicates newer content, relevant Cache API entries are refreshed. The user sees fresh content on their next navigation within the session.

**On the `online` event** — When connectivity is restored after a period offline, the freshness check runs again to ensure any content cached during the offline period is refreshed.

**Push-triggered invalidation** — The Push API can deliver content invalidation messages to the Service Worker even when the application is not open (across all push-supporting browsers). The Service Worker receives the push message, identifies which cache entries are stale from the payload, and fetches fresh versions. This is the most reliable mechanism for non-PWA browsers.

---

## Service Worker Communication Patterns

### Main Thread to Service Worker

The main thread communicates with the controlling Service Worker via `navigator.serviceWorker.controller.postMessage()`. This is fire-and-forget by default. For request/response patterns, a `MessageChannel` is created: one port is sent to the Service Worker with the message, the other is retained by the main thread. The Service Worker responds on the received port, and the main thread receives the response on the retained port. This allows multiple concurrent outstanding requests without conflating their responses.

### Service Worker to Main Thread

The Service Worker communicates with controlled clients via `self.clients.matchAll()`, which returns the set of all open tab contexts matching the Service Worker's scope. `client.postMessage()` sends a message to a specific client. Broadcast to all clients is `clients.matchAll().then(clients => clients.forEach(c => c.postMessage(...)))`. This is the mechanism for pushing state changes — "a sync completed", "new content is available", "your offline queue has been delivered" — to open tabs without requiring the tab to poll.

### BroadcastChannel for Cross-Context Events

For events that tabs need to receive regardless of whether they are the initiating tab — "another tab has completed a sync", "another device has pushed an update via push" — `BroadcastChannel` is used. The Service Worker posts to the channel; all open tabs listening on the same named channel receive the message. This avoids the `clients.matchAll()` dance and is the simpler pattern for broadcast-only events.

---

## Browser Support Matrix

|API / Feature|Chrome|Firefox|Safari|Edge|Status|
|---|---|---|---|---|---|
|Service Worker|Full|Full|Full|Full|Baseline Widely Available|
|Navigation Preload|Full|Full|15.4+|Full|Baseline Widely Available|
|Cache API|Full|Full|Full|Full|Baseline Widely Available|
|Background Sync API|Full|Disabled|No|Full|Chromium-only in practice|
|Push API|Full|Full|16.4+|Full|Baseline Widely Available|
|Periodic Background Sync|Full|No|No|Full|Chromium + installed PWA only|
|Notification API|Full|Full|15.4+|Full|Widely Available|
|Background Fetch API|Full|No|No|Full|Chromium-only|
|navigator.onLine / events|Full|Full|Full|Full|Baseline Widely Available|

---

## Standards and References

- WHATWG HTML Living Standard — Service Workers: `html.spec.whatwg.org/multipage/workers.html`
- W3C Service Workers spec: `w3.org/TR/service-workers`
- WICG Background Sync: `wicg.github.io/background-sync/spec`
- WICG Periodic Background Sync: `wicg.github.io/periodic-background-sync`
- W3C Push API: `w3.org/TR/push-api`
- IETF RFC 8292 — VAPID for Web Push: `rfc-editor.org/rfc/rfc8292`
- IETF RFC 8030 — HTTP Web Push: `rfc-editor.org/rfc/rfc8030`
- MDN — Service Worker API: `developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API`
- MDN — Background Synchronization API: `developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API`
- MDN — Push API: `developer.mozilla.org/en-US/docs/Web/API/Push_API`
- MDN — NavigationPreloadManager: `developer.mozilla.org/en-US/docs/Web/API/NavigationPreloadManager`
- MDN — Offline and background operation guide: `developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation`
- web.dev — Service Worker lifecycle: `web.dev/articles/service-worker-lifecycle`
- web.dev — Navigation Preload: `web.dev/blog/navigation-preload`
- Chrome Developers — Periodic Background Sync: `developer.chrome.com/docs/capabilities/periodic-background-sync`
- Atyantik — Web Push and VAPID end-to-end flow: `atyantik.com/web-push-and-vapid-breaking-down-the-end-to-end-flow`
- TestMu — Background Sync browser support 2026: `testmuai.com/learning-hub/background-sync-browser-support`