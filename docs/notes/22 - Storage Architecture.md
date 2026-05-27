## Storage Architecture

**Spec Authorities:** WHATWG File System Living Standard · W3C IndexedDB 3.0 · W3C Storage Standard · MDN Web Docs  
**Status:** Working Specification — May 2026  
**Baseline Coverage:** IndexedDB (Widely Available) · Cache API (Widely Available) · StorageManager (Widely Available) · OPFS (Widely Available, March 2023) · File System Access API (Chromium + Safari partial)

---

## Overview and Design Thesis

The browser provides not one but five distinct, complementary storage surfaces, each governed by its own specification and optimised for a different access pattern. The fundamental architectural error of most web applications is treating these surfaces as interchangeable or reducing them to a single key/value abstraction. This architecture treats each storage surface as a first-class primitive with its own contract, then composes them through a unified façade (`core.storage`) that routes operations to the appropriate surface based on declared data characteristics.

The unifying principle is that storage in this architecture is **local-first and offline-capable by design**. Application state flows from local storage to UI; the network and remote synchronisation are background concerns. The storage layer is the system of record, not a cache for remote state.

---

## Storage Taxonomy

### 1. `localStorage` / `sessionStorage` — Synchronous Key/Value

**Spec:** WHATWG HTML Living Standard — Web Storage  
**Status:** Baseline Widely Available  
**Quota:** ~5–10MB per origin (browser-defined hard limit)

These are synchronous APIs. Every read and every write blocks the main thread. This is not a theoretical concern — a blocked main thread degrades INP (Interaction to Next Paint), the Core Web Vital that measures input responsiveness. Even small synchronous storage reads on a loaded main thread during user interaction will register as a performance regression.

The only remaining legitimate use case for `localStorage` in this architecture is **synchronously-needed bootstrap configuration** that must be available before the first render frame — values like `colorScheme`, `locale`, or `featureFlags` that the application shell reads before any asynchronous operation can complete. Everything else belongs in IndexedDB.

`sessionStorage` behaves identically but is scoped to the tab session. It is cleared when the tab is closed. This makes it suitable only for ephemeral, tab-scoped UI state (unsaved draft text, in-progress wizard step) where loss on tab closure is acceptable.

Architectural constraints:

- `localStorage` is synchronous and therefore forbidden for large data operations, blob storage, or structured objects.
- `localStorage` is not available in Service Workers or Dedicated Workers — it is a main-thread-only API.
- `localStorage` fires a `storage` event on all other tabs in the same origin when a value is modified. This event mechanism is crude compared to `BroadcastChannel` but can be used for simple cross-tab signals.
- Neither surface participates in the Storage Standard quota pool, and neither is protected by `navigator.storage.persist()`.

### 2. IndexedDB — Transactional Asynchronous Object Store

**Spec:** W3C IndexedDB 3.0  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API`  
**Status:** Baseline Widely Available  
**Quota:** Origin quota pool — typically 50–80% of available disk space, subject to browser eviction policy

IndexedDB is the primary storage mechanism for all structured application data. It is a NoSQL, object-store-based transactional database that runs fully asynchronously on the main thread without blocking the event loop. Every operation in IndexedDB returns an `IDBRequest` object and resolves through events or Promises. The synchronous IndexedDB API was defined and subsequently removed from the specification; it does not exist.

#### Conceptual Model

IndexedDB's data model consists of nested layers:

**Database → Object Stores → Records → Indexes**

A single origin has one or more named databases. Each database is opened at a specific version number. Each database contains one or more named object stores, which are analogous to tables in a relational model. Each record in an object store is a key/value pair where the value is any structured-cloneable JavaScript value (objects, arrays, typed arrays, Blobs, Files). Each object store may have one primary key strategy and zero or more secondary indexes.

**Primary Key Strategies:**

- `keyPath` — A property path on each record object acts as the primary key. The record itself carries its key. The store enforces uniqueness.
- `autoIncrement` — The store generates monotonically increasing integer keys automatically. No property on the record object is required to hold the key.
- Out-of-line key — The key is provided separately at write time, not derived from the record. Flexible but requires manual key management.

**Indexes:**

An index is a derived ordered view over an object store, keyed by a nominated property path on each record. Indexes enable efficient non-primary-key queries: all records where `status === 'pending'`, all records where `createdAt` falls in a date range. Without an index, such queries require a full object store scan via cursor.

Index properties:

- `unique` — Enforces uniqueness of the indexed property across all records. Useful for email addresses, usernames, external IDs.
- `multiEntry` — For records where the indexed property is an array, creates one index entry per array element. Enables tag-based queries.

#### Transaction Model

Every IndexedDB operation must occur within a transaction. Transactions define the scope (which object stores are accessed) and the mode (`readonly` or `readwrite`). A `versionchange` transaction is the third mode, used exclusively during schema upgrades; it cannot be created manually.

Transaction semantics that determine correctness:

- Multiple `readonly` transactions may run concurrently against the same object store. They do not block each other.
- A `readwrite` transaction holds an exclusive lock on its declared object stores. Other `readwrite` transactions targeting the same stores queue behind it.
- A transaction commits automatically when no further requests are pending against it and its completion callback chain has fully resolved. A transaction that is not actively used will auto-commit — do not hold transactions open across `await` boundaries or yield points, as the transaction may auto-commit before the continuation runs.
- A transaction aborts (rolls back all its operations atomically) on any failed request unless explicitly caught, or if `transaction.abort()` is called explicitly. The entire transaction's writes are undone atomically.

#### Schema Versioning and Migration

IndexedDB's versioning model is client-side and self-contained. The database maintains an integer version number. When `indexedDB.open(name, newVersion)` is called with a version number higher than the stored version, the browser fires an `upgradeneeded` event before the database opens. The `upgradeneeded` handler runs inside a `versionchange` transaction — the only context where `createObjectStore()`, `deleteObjectStore()`, `createIndex()`, and `deleteIndex()` may be called.

Migration strategy: migrations are applied sequentially from the current persisted version to the target version. Each integer version increment represents a discrete, atomic migration step. A migration function for version N must complete before the migration for version N+1 runs. This is enforced structurally via a `switch` statement with intentional fall-through, or via an ordered array of migration functions indexed by version number.

The `blocked` event fires when an existing connection to the database (in another tab or worker) prevents the version upgrade from proceeding. Applications must listen for `blocked` and notify the user to close other tabs, or proactively listen for `versionchange` events on existing connections and close them gracefully.

#### Cursors and Key Ranges

For bulk data traversal and range queries, IndexedDB provides cursors and `IDBKeyRange`. A cursor iterates through records in key order (or index order). `IDBKeyRange` defines a bounded range for queries: `only()` (exact match), `lowerBound()`, `upperBound()`, `bound()` (inclusive or exclusive bounds on both ends). Cursors combined with key ranges enable efficient paginated access to large datasets without loading the entire object store into memory.

Cursor direction: `next` (ascending), `prev` (descending), `nextunique` / `prevunique` (skip duplicate index values).

### 3. Cache API — Request/Response Object Store

**Spec:** WHATWG Fetch Living Standard (Cache API section)  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Cache`  
**Status:** Baseline Widely Available

The Cache API is a key/value store where keys are `Request` objects and values are `Response` objects. It is specifically designed for caching HTTP-style request/response pairs. It is available in Service Workers, Dedicated Workers, Shared Workers, and the main thread — but its primary use case is within the Service Worker, where it backs the fetch interception and caching strategies.

The Cache API shares its storage quota with IndexedDB and OPFS under the Storage Standard. It is not a separate quota bucket.

**Named cache management:** Each origin may have multiple named caches (`caches.open('v1-shell')`, `caches.open('v2-api-responses')`). Cache versioning is manual — old caches must be explicitly deleted during the Service Worker's `activate` event. A convention of `cacheNamePrefix-version` enables systematic cleanup.

**API surface:**

- `caches.open(name)` — Opens or creates a named cache, returning a `Cache` object.
- `cache.match(request)` — Returns the first matching `Response` for the request, or `undefined`.
- `cache.put(request, response)` — Stores a request/response pair. Both the `Request` and `Response` objects must be used or cloned before storing, as they are stream-based and can only be consumed once.
- `cache.add(url)` / `cache.addAll(urls)` — Fetches URLs from the network and stores them. Fails if any network request fails.
- `cache.delete(request)` — Removes a cached entry.
- `cache.keys()` — Returns all cached `Request` keys.

**Response cloning:** A `Response` body is a `ReadableStream` that can only be consumed once. To both respond to a fetch event and store the response in cache, the response must be cloned: `const clone = response.clone(); cache.put(request, clone); return response;`.

**Caching strategy mapping** (also addressed in `offline-engine.md`):

|Strategy|Trigger|Use Case|
|---|---|---|
|Cache-First|SW fetch event|Application shell, fonts, hashed static assets|
|Network-First with Cache Fallback|SW fetch event|API responses, dynamic HTML|
|Stale-While-Revalidate|SW fetch event|Content that benefits from freshness but must load fast|
|Network-Only|SW fetch event|Auth endpoints, payment flows — never cache|
|Cache-Only|SW fetch event|Precached assets guaranteed to be in cache|

Stale-While-Revalidate deserves architectural note: the cache response is returned immediately to unblock rendering, while the network request runs in parallel to update the cache for the next access. The user receives the previously cached version instantly; they will see the updated version on their next request. This is the correct strategy for API responses that change frequently but where brief staleness is acceptable.

### 4. Origin Private File System (OPFS) — High-Performance Private Filesystem

**Spec:** WHATWG File System Living Standard  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system`  
**Status:** Baseline Widely Available (March 2023 — all modern browsers)

OPFS is a private, origin-scoped virtual filesystem that provides byte-level, in-place file access. It is invisible to the user's OS file manager, isolated from other origins, and subject to the browser's storage quota. It does not require user permission prompts — `navigator.storage.getDirectory()` returns the root `FileSystemDirectoryHandle` without a picker dialog.

**The critical architectural distinction from IndexedDB:** OPFS provides a `FileSystemSyncAccessHandle` — accessible only within a Dedicated Web Worker — that exposes fully synchronous read and write operations. This synchronous access path eliminates Promise resolution overhead for each I/O operation, making OPFS 3–4x faster than IndexedDB for sequential and random-access file workloads. This is what makes SQLite-on-the-web viable: the WASM-compiled SQLite library uses OPFS's synchronous access handle as a file descriptor, achieving near-native I/O performance.

**Access modes:**

The OPFS has two distinct access modes with different performance and concurrency characteristics:

`FileSystemFileHandle.createWritable()` — Asynchronous writable stream. Available on the main thread and in all worker types. Creates a temporary write buffer; changes are not committed until `writable.close()` is called. This atomic commit model protects against partial writes.

`FileSystemFileHandle.createSyncAccessHandle()` — Synchronous access handle. Available **only in Dedicated Web Workers** (not the main thread, not SharedWorker, not ServiceWorker). Provides `read()`, `write()`, `truncate()`, `getSize()`, `flush()`, and `close()` as synchronous blocking calls. The calling Worker is blocked during I/O, which is acceptable because Workers do not share the main thread's event loop.

**OPFS concurrency model:** OPFS does not handle concurrency between tabs by default. If multiple tabs access the same OPFS file simultaneously, the application is responsible for coordination. The correct coordination primitive is the Web Locks API: acquire an exclusive lock on the logical OPFS file name before accessing the file, release it when done. This mirrors how native applications use file-level locks.

**Architecture pattern — all OPFS work in a Worker:** Given that the synchronous access path (the performant one) is Worker-only, the correct design is to place all OPFS operations inside a Dedicated Worker. The main thread communicates with the Worker via `postMessage`; the Worker performs synchronous file I/O and posts results back. This produces a clean boundary: the main thread never blocks, and the OPFS Worker operates synchronously for maximum throughput.

**Primary use cases in this architecture:**

- SQLite database backing store (via WASM SQLite compilation)
- Binary file caching for media and document applications
- Large sequential write workloads (log files, export buffers)
- Any workload where IndexedDB's object-store model is a poor fit for the data shape

### 5. StorageManager API — Quota Governance and Persistence Control

**Spec:** WHATWG Storage Standard  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/StorageManager`  
**Status:** Baseline Widely Available

The StorageManager API (`navigator.storage`) is the cross-cutting governance layer for all browser storage. It provides two primary capabilities: storage estimation and persistence control.

**`navigator.storage.estimate()`** — Returns a Promise resolving to a `StorageEstimate` object with `quota` (the maximum bytes available to the origin) and `usage` (the bytes currently used across all storage mechanisms). These are estimates, not exact figures — browsers intentionally introduce padding to prevent timing-based fingerprinting. Usage values reflect IndexedDB, Cache API, and OPFS combined. `localStorage` and `sessionStorage` are not included in this estimate.

Quota sizes are browser-defined and disk-relative:

- Chrome: up to 80% of total disk space per storage pool, with per-origin allocation within that.
- Firefox: uses a group-level and origin-level tiered quota.
- Safari (post-iOS 17 / macOS Sonoma): calculates per-origin quota from total disk space without user prompts. Evicts data for origins with no user interaction in 7+ days under ITP (Intelligent Tracking Prevention).

**`navigator.storage.persist()`** — Requests that the origin's storage be granted persistent (non-evictable) status. Returns a Promise resolving to a boolean: `true` if the browser grants persistent storage, `false` if it does not. Browsers apply their own heuristics for granting persistence — Chrome considers whether the origin has been added to the home screen, whether the user has engaged with it significantly, or whether the Push API has a subscription. Firefox shows a user permission prompt.

**`navigator.storage.persisted()`** — Returns the current persistence mode of the origin's storage without requesting a change. Useful for checking on startup whether the application can rely on data not being evicted.

**Architectural requirement for production offline-first applications:** Any application that uses offline storage as a system of record (not merely a cache) must call `navigator.storage.persist()` during the application's first meaningful engagement and must check `navigator.storage.persisted()` on every startup. Silent data loss from browser eviction is catastrophic for offline-first applications. The system should surface a warning to the user if persistence is denied.

### 6. File System Access API — User-Visible Filesystem (Chromium + Safari limited)

**Spec:** WHATWG File System Living Standard  
**Status:** `showOpenFilePicker()` / `showSaveFilePicker()` — Chromium only. OPFS subset — all modern browsers.

The File System Access API provides access to the user's actual filesystem with explicit per-session permission. It is the correct API for document editors, media tools, and any application that must open and save files as a native application would. The API is permission-gated: the user interacts with a file picker dialog that grants access to a specific file or directory.

`FileSystemFileHandle` objects can be stored in IndexedDB for persistence across sessions. On subsequent sessions, the application can call `handle.requestPermission()` to restore access without a new picker dialog (user confirmation is still required).

**Browser gap:** `showOpenFilePicker()` and `showSaveFilePicker()` are Chromium-only. Firefox and Safari support OPFS but not the user-visible file picker. Any feature using the file picker must provide a `<input type="file">` fallback path, which does not support writes back to the original file location.

---

## core.storage Unified Façade

### Design Contract

Application code never calls `indexedDB.open()`, `caches.open()`, `navigator.storage.getDirectory()`, or `localStorage.setItem()` directly. All storage interactions pass through `core.storage`, which routes each operation to the correct underlying mechanism based on the declared storage tier of the data.

The façade enforces three invariants across all storage operations:

1. All writes are wrapped in error handling for `QuotaExceededError`.
2. All reads are served from an in-memory LRU cache before hitting the persistence layer, where applicable.
3. All destructive operations (delete, clear, schema upgrade) are gated behind the Web Locks API where cross-tab concurrent access is possible.

### Storage Tier Declaration

Each class of data in the application declares a storage tier, analogous to declaring a column type in a schema. The tier determines which storage mechanism backs it:

**Tier 0 — Session (memory only):** Ephemeral UI state, in-progress user input, speculative state. Backed by in-memory Map or reactive store. Not persisted across page loads.

**Tier 1 — Configuration (localStorage):** Small, frequently-read, synchronously-needed values. Restricted to primitive types. Maximum total size enforced at the tier boundary. No objects, no arrays.

**Tier 2 — Structured Data (IndexedDB):** All application domain data: records, collections, sync queue, user content. The default tier for any non-trivial persistent state. Participates in quota management.

**Tier 3 — HTTP Resources (Cache API):** Fetched resources and their responses. Managed by the Service Worker for network interception. Application code interacts with this tier indirectly via cache strategy declarations, not direct Cache API calls.

**Tier 4 — Binary/File Data (OPFS):** Large files, binary blobs, SQLite databases. Exclusively accessed from a dedicated Worker. The main thread communicates with the OPFS Worker via postMessage.

### Conceptual Public Interface

```
core.storage.get(key, tier?)            → Promise<T | null>
core.storage.set(key, value, tier?)     → Promise<void>
core.storage.delete(key, tier?)         → Promise<void>
core.storage.query(store, query)        → Promise<T[]>
core.storage.transaction(stores, mode, fn) → Promise<T>
core.storage.estimate()                 → Promise<StorageEstimate>
core.storage.persist()                  → Promise<boolean>
core.storage.persisted()                → Promise<boolean>
core.storage.onQuotaWarning(handler)    → Disposer
```

### In-Memory LRU Read Cache

Reads against IndexedDB incur an asynchronous round-trip that, while non-blocking, adds latency. For frequently-read records (user profile, active session, feature flags), a bounded in-memory LRU cache sits in front of IndexedDB. Cache entries are invalidated on write (write-through) and on receipt of a `BroadcastChannel` message indicating that another tab has modified the same record.

The LRU cache is not a correctness mechanism — it is a performance optimisation. It does not participate in IndexedDB transactions. All writes go to IndexedDB first; the in-memory cache is updated on write success.

### Write Journal for Durability

For writes that must survive a tab crash before reaching IndexedDB, a write journal buffers pending writes in `localStorage` (synchronous and crash-durable) before applying them to IndexedDB. On application startup, the system checks for unprocessed journal entries and replays them. This pattern addresses the gap between user action confirmation (synchronous, must feel instant) and durable storage commitment (asynchronous).

The journal is intentionally separate from the Background Sync queue. The journal handles crash recovery for in-progress writes. Background Sync handles network operation replay for offline actions.

---

## IndexedDB Schema Design Principles

### Object Store Naming Conventions

Object stores are named in lowercase, singular noun form: `user`, `document`, `message`, `syncQueueEntry`. Compound stores use underscore separators: `document_version`, `auth_token`.

### Index Design for Query Patterns

Indexes are defined up-front based on the query patterns the application will use. Adding an index requires a schema version increment and a migration. Index design considerations:

- Compound indexes are not supported in IndexedDB in the SQL sense. A compound-key lookup requires a compound index property (a synthetic property on each record that concatenates the relevant fields, e.g., `statusCreatedAt: record.status + '_' + record.createdAt.toISOString()`).
- Sparse indexes — indexes where not all records have the indexed property — are supported; records without the property are simply not indexed.
- Index cardinality matters for performance. High-cardinality indexes (unique IDs) enable precise lookups. Low-cardinality indexes (boolean flags, status enums) are better queried with a range scan on a compound index or by filtering cursor results.

### Schema Migration Pattern

Each migration is a pure function that receives the `IDBOpenDBRequest.result` database reference and the version change transaction, and returns when the migration is complete. Migrations are applied in order, are idempotent with respect to the target version, and never lose data without an explicit destructive migration marker.

A migration that adds a new object store simply calls `db.createObjectStore()`. A migration that adds an index to an existing store calls `objectStore.createIndex()` on the `versionchange` transaction's object store reference (not the database reference). A migration that changes the schema of existing records opens a cursor on the store within the `versionchange` transaction and rewrites each record.

---

## Quota Management and Eviction Strategy

### Proactive Quota Monitoring

Storage quota monitoring runs at two points in the application lifecycle:

**Startup check:** On every application start, `navigator.storage.estimate()` is called. If usage exceeds 60% of quota, a low-water warning is logged internally. If usage exceeds 80%, the application triggers its storage reclamation routine and may surface a user notification.

**Pre-write check:** Before any bulk write operation (data import, sync batch apply), the estimated post-write size is compared against available quota. If the write would exceed 90% of quota, the write is blocked and the user is informed.

### Storage Reclamation Routine

When quota pressure is detected, the application executes a tiered reclamation strategy:

1. **Cache API cleanup:** Delete all caches outside the current version name. Delete Stale-While-Revalidate entries not accessed in the past 30 days.
2. **IndexedDB LRU pruning:** Identify records with an `lastAccessedAt` timestamp. Delete the oldest records in low-priority stores (analytics events, read notification history, search result caches) until the target threshold is cleared.
3. **Persistence re-request:** If `navigator.storage.persist()` has not been granted, re-request it. Persistent storage is exempt from the browser's LRU eviction policy.
4. **User notification:** If reclamation is insufficient, surface a clear, actionable message to the user explaining the storage situation and providing options.

### QuotaExceededError Handling

Every write path in `core.storage` wraps its persistence call in a `try/catch` block that specifically catches `DOMException` with `name === 'QuotaExceededError'`. On catching this error, the storage layer emits a `core.events.emit('storage:quotaExceeded', { attempt, estimated })` event that the application layer can respond to with the reclamation routine or a user notification. The write that triggered the error is not silently dropped — it is held in a retry queue to be replayed after reclamation.

---

## Cross-Browser Storage Behaviour Matrix

|Mechanism|Chrome|Firefox|Safari|Notes|
|---|---|---|---|---|
|IndexedDB|Widely Available|Widely Available|Widely Available|Safari's ITP evicts data for inactive origins after 7 days (persistent mode exempt)|
|Cache API|Widely Available|Widely Available|Widely Available|Quota shared with IDB|
|OPFS (async)|✓|✓|✓|All modern browsers since March 2023|
|OPFS (sync, Worker-only)|✓|✓|✓|`FileSystemSyncAccessHandle` in Dedicated Workers only|
|StorageManager.persist()|✓|Prompts user|✓ (iOS 17+)|Heuristic-based in Chrome|
|File System Access (picker)|✓|✗|✗|OPFS subset only in Firefox/Safari|
|localStorage|Widely Available|Widely Available|Widely Available|Synchronous; not in Workers|
|Compression Streams|Widely Available|Widely Available|Widely Available|Integrated with storage writes for large records|

---

## Compression Integration

For records exceeding a configurable size threshold (default: 64KB), `core.storage` automatically compresses values before writing to IndexedDB and decompresses on read. The Compression Streams API (`new CompressionStream('gzip')` / `new DecompressionStream('gzip')`) is used for this transformation. This is a Baseline Widely Available API requiring no library dependency.

Compression is applied transparently at the `core.storage` serialisation layer. Callers of `core.storage.set()` and `core.storage.get()` are unaware of whether compression has been applied. A metadata flag on the stored record indicates compression state.

---

## Storage and Security

All storage is origin-isolated by the browser's Same-Origin Policy. IndexedDB, Cache API, OPFS, and localStorage are each siloed to the current origin (scheme + host + port). Cross-origin storage sharing is not possible and is not supported in this architecture.

For sensitive data (authentication tokens, encryption keys, personally identifiable information), the storage layer applies additional controls:

- Auth tokens are stored in IndexedDB (not localStorage, which is accessible to any same-origin XSS payload without additional controls), encrypted using a `CryptoKey` stored in a separate object store. The key itself is managed via the SubtleCrypto API.
- Encryption keys are never stored in plaintext. Where platform-level secure enclaves are not available (they are not, in the browser), keys are wrapped using a user-derived KDF (PBKDF2 or Argon2 via WASM) before storage.
- The storage layer never logs record contents. Log statements reference keys, operation types, and byte sizes only.

---

## Storage Partitioning (Cross-Origin Isolation Context)

As of 2025–2026, browsers implement storage partitioning: third-party embedded contexts (iframes with cross-origin sources) have their storage access partitioned by the top-level origin. This prevents cross-site tracking via shared IndexedDB state. This architecture does not rely on cross-origin storage sharing. All storage reads and writes occur in the first-party context or in Workers spawned by the first-party context.

---

## Relationship to Other Architecture Modules

- **offline-engine.md:** The offline sync queue is stored in IndexedDB (Tier 2). The Service Worker reads pending operations from IndexedDB during Background Sync events. The Cache API is managed by the Service Worker for HTTP response caching.
- **worker-architecture.md:** OPFS synchronous access is exclusively managed from within a Dedicated Worker (`core/workers/opfs-worker.js`). The Web Locks API coordinates cross-tab IndexedDB writes.
- **security.md:** SubtleCrypto key management integrates with the storage layer for at-rest encryption of sensitive records.
- **internal-api.md:** `core.storage` is one of the seven primary namespaces in the Internal API surface. All direct IndexedDB, Cache API, and OPFS access in the application routes through `core.storage`.

---

_References:_  
_WHATWG File System Living Standard: `fs.spec.whatwg.org`_  
_W3C IndexedDB 3.0: `w3.org/TR/IndexedDB-3`_  
_W3C Storage Standard: `storage.spec.whatwg.org`_  
_W3C Web Locks API: `w3.org/TR/web-locks`_  
_MDN — Storage quotas and eviction criteria: `developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria`_  
_web.dev — Origin Private File System: `web.dev/articles/origin-private-file-system`_  
_WebKit — Updates to Storage Policy (Safari 17): `webkit.org/blog/14403/updates-to-storage-policy`_