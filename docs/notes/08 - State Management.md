## State Management Architecture

**Version:** 1.0  
**Status:** Working Specification  
**Date:** May 2026  
**Authority:** MDN Web Docs, WHATWG HTML Living Standard, W3C IndexedDB API, WHATWG Storage Standard

---

## Table of Contents

1. [Conceptual Foundation](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#1-conceptual-foundation)
2. [State Topology](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#2-state-topology)
3. [URL State](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#3-url-state)
4. [Session State](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#4-session-state)
5. [Persistent Local State](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#5-persistent-local-state)
6. [Remote State](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#6-remote-state)
7. [Store Architecture](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#7-store-architecture)
8. [Immutability Discipline](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#8-immutability-discipline)
9. [State Initialisation and Hydration](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#9-state-initialisation-and-hydration)
10. [Optimistic Updates](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#10-optimistic-updates)
11. [Cross-Tab State Consistency](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#11-cross-tab-state-consistency)
12. [IndexedDB Schema Versioning](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#12-indexeddb-schema-versioning)
13. [Storage Quota and Eviction](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#13-storage-quota-and-eviction)
14. [State Debugging and Introspection](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#14-state-debugging-and-introspection)
15. [core.state and core.storage — API Reference](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#15-corestate-and-corestorage--api-reference)
16. [State Management Decision Reference](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#16-state-management-decision-reference)

---

## 1. Conceptual Foundation

State management is not a single problem. It is four distinct problems that are frequently conflated, leading to architectures where ephemeral UI state is unnecessarily persisted, where server-fetched data is treated as a source of truth it cannot reliably be, and where URL-encodable state lives in JavaScript memory and breaks on reload.

The foundational discipline of this architecture is to classify every piece of state before deciding where it lives. The classification is not arbitrary — it follows directly from the state's identity properties: who owns it, how long it should survive, whether it must be shareable, and what the correct authoritative source is.

A secondary discipline is that state flows in one direction. The reactive state layer is the single source of truth for in-memory application state. The storage layer is the source of truth for persistent state. The server is the source of truth for remote state. These layers do not compete for authority; they compose. Remote state is fetched from the server, materialised into the storage layer, and projected into the reactive layer for components to consume. Local mutations flow in the opposite direction: reactive state is written, the storage layer is updated, and changes are eventually synchronised to the server. Components never talk to the server directly; they read from and write to the reactive layer.

---

## 2. State Topology

Application state is classified into four categories. Every piece of state in the application can and must be assigned to exactly one of these categories at design time.

**URL State** is encoded in the URL: the pathname, search parameters (`?key=value`), and hash fragment. It is owned by the router. It is authoritative for all state that affects the rendered view and must survive a hard reload, be shareable via link, or be navigable with the browser's back and forward buttons. Filter selections, pagination, search queries, active tab, and view mode are the canonical examples. A user who shares a URL containing this state gives the recipient an identical starting view.

**Session State** is in-memory state owned by the application for the lifetime of the browsing session. It is lost on reload. It is managed by the Proxy-based reactive state layer. Its appropriate domain is transient UI state that does not warrant URL encoding or storage: which dropdown is open, what text is typed but not submitted, a locally computed selection that would be stale on reload anyway.

**Persistent Local State** is stored in IndexedDB and survives reload, tab close, and device sleep. It is owned by the storage layer. Its appropriate domain is everything that should survive a reload but is not appropriate for the URL: user preferences, cached remote data, offline-queued mutations, authentication tokens, and application data in offline-first deployments. It is the closest the web platform has to a local database.

**Remote State** is data that originates on a server. It is never the source of truth on the client; it is a snapshot of the server's state at a point in time. Remote state is always projected into one of the other three layers — typically Persistent Local State — after being fetched. Components do not render directly from a pending network request; they render from local state that has been (or is being) hydrated from the server.

---

## 3. URL State

**Spec:** WHATWG URL Living Standard — URLSearchParams  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/URLSearchParams`  
**Status:** Baseline — Widely Available

### What belongs in the URL

The rule is simple: if a user should be able to reload the page and see the same view, the state that determines that view must be in the URL. This includes search queries, active filters, sort orders, pagination offsets, active tabs, selected items that determine secondary content panes, and modal states that correspond to meaningful application views (a product detail overlay is a view; a confirmation dialog is not).

The inverse is equally important. Transient UI state that is meaningless on reload — an open dropdown, an in-progress hover state, a loading indicator — does not belong in the URL. Over-encoding the URL degrades shareability by producing noisy, unreadable links and can trigger unnecessary navigation history entries on trivial interactions.

### URLSearchParams API

`URLSearchParams` is the correct API for reading and writing URL state. It handles percent-encoding automatically, supports multiple values for the same key (`getAll()`), and produces correctly formatted query strings via `toString()`. Manual string concatenation or `location.search` manipulation is never used.

Reading URL state uses the Navigation API's current entry:

```js
const params = new URLSearchParams(window.navigation.currentEntry.url.split('?')[1] ?? '');
const view = params.get('view') ?? 'list';
const page = Number(params.get('page') ?? '1');
const query = params.get('q') ?? '';
```

Writing URL state uses `core.router.navigate()` with a `replace` strategy for state changes that should not create new history entries (filter changes, pagination within a result set) and a `push` strategy for state changes that represent distinct navigable states (navigating to a detail view):

```js
function updateFilter(key, value) {
  const params = new URLSearchParams(window.navigation.currentEntry.url.split('?')[1] ?? '');
  value ? params.set(key, value) : params.delete(key);
  params.set('page', '1'); // reset pagination on filter change
  core.router.replace(`${pathname}?${params.toString()}`);
}
```

### Type coercion discipline

All URL parameters are strings. Every read from `URLSearchParams` returns a string or `null`. The application layer must explicitly coerce to the expected type at every read site. Numeric parameters use `Number()` with a fallback; boolean parameters use string comparison (`params.get('archived') === 'true'`); enumerated parameters are validated against an allowed set with a fallback to the default.

This coercion is not optional — URL parameters are a direct entry point into the application from external input. An invalid value in a parameter (a non-numeric page number, an unrecognised sort key) must produce a valid application state, not an error. All URL state reads are treated as untrusted external input and validated accordingly.

### URL state and the Navigation API

The Navigation API's `navigate` event fires for every state change in the URL, including programmatic `replace` calls from the URL state layer. This means all URL state changes are automatically reflected in the router's dispatch pipeline, view transitions fire for navigation-level URL changes, and the browser's history entries are correctly managed. URL state management and navigation are unified, not separate concerns.

Browser security places a rate limit on `navigation.navigate()` and `history.pushState()` calls. Applications that update URL state on every keystroke (search-as-you-type patterns) must debounce or throttle the URL write to stay within this limit. The reactive state layer holds the live value; the URL is updated asynchronously after a debounce interval.

---

## 4. Session State

Session state lives in the `core.state` Proxy-based reactive store. It is the fastest-access tier — no I/O, no serialisation, no cross-context coordination — and is the default location for all in-memory application state.

### What belongs in session state

Session state is appropriate for state that is meaningless to persist: the current user's expanded accordion items, which notification was most recently dismissed, the currently focused item in a list, partial form content that should be abandoned on reload. It is also appropriate as the working memory for state that will eventually be written to IndexedDB — the authoritative value is in IndexedDB, but the live, mutable, component-visible value is in the reactive store.

### Session state as a projection layer

The reactive store is not a first-class database. It is the projection layer through which components consume state from all other tiers. A component always reads from the reactive store; it does not read directly from IndexedDB. The storage layer writes into the reactive store when data is loaded; the reactive store writes back to the storage layer when data is mutated. This indirection ensures that components are insulated from the async nature of IndexedDB reads and from the serialisation format of stored data.

### Initialisation state for remote data

Remote state creates a three-phase initialisation cycle that must be modelled explicitly in session state: loading (the data has been requested but has not arrived), hydrated (the data is present, sourced from local cache or network), and error (the request failed with no fallback available). Components subscribe to these status flags alongside the data itself. A component that renders without checking the loading flag will render with undefined data; a component that only checks the data will not know whether the absence of data is "not yet loaded" or "confirmed empty." Both are distinct states that require different rendering behaviour.

---

## 5. Persistent Local State

**Spec:** W3C Indexed Database API Level 3  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API`  
**Status:** Baseline — Widely Available

### IndexedDB as the persistent state layer

IndexedDB is the correct storage mechanism for all structured application data that must survive reload. Its storage capacity is origin-based and typically 50–80% of available disk space — substantially larger than any other browser storage API. It is asynchronous, transactional, and indexed, making it suitable for structured querying without blocking the main thread.

The `core.storage` module wraps IndexedDB's callback-based API with a Promise-based interface. Application code does not open connections, manage transactions, or handle `IDBRequest` objects directly. All of this is encapsulated in the storage façade.

### The write-through pattern

Mutations to persistent state follow a write-through pattern. When a mutator writes a value, it writes to the reactive store first (making the change immediately visible to subscribed components) and then writes to IndexedDB asynchronously in the background. The two writes are not atomic — a crash after the reactive store write but before the IndexedDB write will produce a state inconsistency on next load. For state where this matters (mutations that must be durable), the pattern is inverted: the IndexedDB write is awaited before the reactive store is updated. This trades immediacy for durability. The appropriate pattern is chosen per state domain based on its consistency requirements.

### Data that must be write-ahead

Mutations that represent user actions with business consequences — item deletion, form submission, financial data — use the write-ahead pattern: the operation is serialised to an IndexedDB pending-operations queue before any in-memory state changes, and the reactive store is updated only after the queue entry is confirmed written. If the application crashes before the operation completes, the queue entry remains, and the operation is replayed on next launch. This is the application-level equivalent of a write-ahead log.

### LRU cache for read performance

IndexedDB reads are asynchronous and involve the browser's storage engine. For frequently accessed state — user profile, active settings, currently loaded data set — the `core.storage` module maintains a bounded in-memory LRU cache. Cache hits return synchronously; cache misses fall through to an IndexedDB read and populate the cache on resolution. The LRU cache is evicted when the component that holds the reference is disconnected, or when a write invalidates the relevant entry.

---

## 6. Remote State

Remote state is data fetched from a server. It is a snapshot of the server's state at a specific point in time. Treating a fetched response as a source of truth is an architectural error: the server state may have changed between the fetch and the component's render; the network may have failed between the previous fetch and the current; the user may be offline entirely.

### Remote state is always materialised locally

Before a component can render data sourced from a server, that data must have been written into Persistent Local State (IndexedDB) or Session State (the reactive store). A component does not hold a pending `Promise` to a network request; it holds a subscription to a state key. The network layer writes the fetched data to the state layer; the state layer notifies the component.

This model produces three benefits: the component's rendering logic is entirely synchronous (it reads from state, not from promises); the component works identically regardless of whether the data came from the network or from a local cache; and the application functions offline because local state is always the rendering source.

### Caching strategies for remote state

Three caching strategies govern how fetched data moves into local state. The appropriate strategy is declared per request in the network layer.

**Cache-First** serves the locally cached version immediately and does not contact the network unless the cache is empty. Appropriate for data that changes infrequently and where stale presentation is acceptable: static reference data, user profile information in the immediate post-login period, configuration values loaded at startup.

**Network-First with Cache Fallback** attempts the network first and falls back to the cached version if the network is unavailable or the request fails. The fetched response updates the cache for future use. Appropriate for data where freshness is preferred but the application must still function offline: feed content, user-generated data, task lists.

**Stale-While-Revalidate** serves the cached version immediately and fires a background network request to update the cache. The component renders with the stale value and receives an update notification when the fresh value arrives and is written to the store. Appropriate for data where instant display matters more than perfect freshness: dashboards, content listings, non-critical reference data. This is the application-level expression of the `stale-while-revalidate` HTTP cache directive applied to the client state layer.

### The three loading states

Remote state has three distinct states that must be modelled explicitly:

`loading` — No data is available. A request has been dispatched. The component renders a skeleton or placeholder. This state should be as brief as possible; a populated local cache means most requests skip directly to the `stale` sub-state of `hydrated`.

`hydrated` — Data is present. It may be fresh (confirmed from the server within an acceptable TTL) or stale (from cache, with a background revalidation in progress). The component renders with the available data; if a revalidation update arrives, the component updates in place without a loading flash.

`error` — The request failed and no cached fallback exists. The component renders an error state with a retry affordance.

A fourth implicit state — `empty` — represents a successful response with an empty result set. It must be distinguished from `loading` and `error` to avoid rendering a "no results" message while data is still fetching.

---

## 7. Store Architecture

### Domain stores

Each domain of application state is an independent store module. A domain store corresponds to a coherent set of data and its associated mutations: a user store owns authentication state and profile data; a preferences store owns user settings; a content store owns the currently loaded content collection.

A store module exports three things: the reactive state object (the `core.state.create()` instance), a set of mutator functions, and optionally a set of computed derivations. Nothing else is exported. Consumers import the store's exports and call mutators; they never access the underlying reactive store's internals.

### No cross-store imports

Store modules do not import each other. A store that needs data from another domain's store receives that data as a parameter to its mutator functions, or reads it from the shared reactive state at call time. This constraint prevents circular dependencies and keeps the store graph acyclic. If two stores genuinely need shared state, that state is extracted into a third store that both can import without circularity.

Cross-store composition is done at two locations: in component code (a component subscribes to multiple stores and derives its rendered output from their combined state) and in explicit mediator modules (`core/state/mediators/`) that orchestrate multi-store workflows. A mediator module imports multiple stores and coordinates mutations across them in response to application-level events. Mediators are permitted to import stores; stores are not permitted to import other stores.

### The store module shape

Every store module follows the same structural convention:

```
// user-store.js
const state = core.state.create({
  profile: null,
  status: 'idle',    // 'idle' | 'loading' | 'hydrated' | 'error'
  permissions: []
});

export function loadProfile(userId, signal) { ... }
export function updateProfile(patch, signal) { ... }
export function clearProfile() { ... }

export const userProfile = state.derived(['profile'], p => p);
export const isAuthenticated = state.derived(['profile'], p => p !== null);

export { state as userStore };
```

The convention is enforced by a linting rule: store files may not export the raw state object under any name other than the store's canonical name (`userStore`, `prefsStore`, etc.), preventing callers from performing direct `store.set()` mutations that bypass the store's mutator logic.

### Mutator design

Mutators are the only code permitted to call `store.set()`. They are responsible for: validating their input, deriving any secondary state changes that must be co-applied with the primary change (updating a `status` flag alongside a `profile` write, for example), writing to IndexedDB for persistent domains, and broadcasting via BroadcastChannel for cross-tab state. A mutator that does only `store.set(key, value)` is always a candidate for additional consistency logic that was forgotten.

---

## 8. Immutability Discipline

Mutators in the store layer do not mutate objects in-place and then notify subscribers of a change. The `Proxy`-based store's `set` trap uses `Object.is()` to detect unchanged values; if the same object reference is mutated in-place and then re-assigned, `Object.is(newValue, oldValue)` is `true` (they are the same reference) and no notification fires. Subscribers receive stale data without knowing it.

### Structural sharing

For complex nested state, structural sharing is the correct update strategy. When a single property of a nested object changes, a new top-level object is created with only the changed branch replaced:

```js
// Correct: creates a new object, old reference is distinct
store.set('user', { ...store.get('user'), name: 'updated' });

// Incorrect: mutates in-place, Object.is check passes, no notification fires
store.get('user').name = 'updated';
store.set('user', store.get('user'));
```

Deep cloning is not the answer to this problem. A deep clone is expensive for large objects, produces a new reference for every nested node regardless of whether it changed, and breaks identity comparisons used for memoisation. Structural sharing creates new references only along the path of the change, preserving reference identity for unchanged subtrees.

### Collections

For collections where order is not required, `Map` and `Set` are preferred over plain arrays. They provide O(1) membership tests (`has()`), O(1) insertions and deletions that do not require re-creating the entire collection, and a cleaner semantic (sets have no duplicate concern; maps have no index confusion). The tradeoff is that `Map` and `Set` are not JSON-serialisable and must be converted for storage or network transmission.

When the collection must be serialisable (for IndexedDB storage or URL encoding), a plain array is used alongside a derived `Map` keyed by `id` for fast lookups. The array is the stored form; the map is a session-state derivation used for O(1) component access.

### Atomic compound mutations

Some mutations must update multiple state keys simultaneously to maintain consistency — setting both a `data` key and a `status` key as part of a completed fetch, for example. These must not be applied as two successive `store.set()` calls, since subscribers to either key would fire between the two writes with an inconsistent state (data updated but status still `loading`).

The `core.state` module exposes a `store.batch(fn)` method that defers all notifications until the batch function completes. All `store.set()` calls within the batch are applied to the store's internal state immediately, but subscribers are notified once after all writes complete. This is the store-level equivalent of the rendering pipeline's scheduled-update batching.

---

## 9. State Initialisation and Hydration

Application startup must follow a defined sequence. Components must not be rendered before the state they depend on has been initialised, or they will display with empty/default values and then flash when the hydrated values arrive.

The startup sequence is:

1. Service Worker registration initiated (non-blocking; continues in background).
2. Import Map resolved; core module graph loaded.
3. `core.storage` opens the IndexedDB connection and runs any pending schema migrations (see section 12).
4. Stores that read from IndexedDB perform their hydration reads. These are parallel `Promise.all()` reads; they do not block each other.
5. Reactive store populated with hydrated values from IndexedDB.
6. Router initialised; first route matched against current URL.
7. Route component mounted into the application shell. It reads from an already-hydrated reactive store.

This sequence ensures that the first render always has locally-persisted state. The "loading" state that components must handle is the loading of fresh remote data in the background — not the hydration of local state. By the time any component is connected to the DOM, the local state is available.

### The `store.hydrate()` method

Hydration is distinguished from mutation. `store.hydrate(snapshot)` applies a plain object to the store without firing change notifications. It is called only once per store, at initialisation, to populate the store from its IndexedDB snapshot. Subsequent changes use `store.set()` and do fire notifications. This distinction matters for components that subscribe before hydration completes: a `store.hydrate()` call that fires notifications would wake every subscriber for every key in the snapshot, producing unnecessary scheduled renders before the component is even connected to the DOM.

### Snapshot format

The `store.snapshot()` method returns a plain object suitable for `JSON.stringify()`. Stores that use `Map` or `Set` internally are responsible for converting these to JSON-serialisable arrays in their snapshot implementation and reconstructing them from array form in their hydration implementation. Snapshot serialisation is encapsulated in the store; callers never need to know the internal collection type.

---

## 10. Optimistic Updates

An optimistic update writes a mutation to local state immediately — without waiting for server confirmation — and then fires the network request in the background. If the server confirms the mutation, no further action is needed. If the server rejects the mutation, the local state is rolled back to its pre-mutation value and the user is notified.

### The case for optimistic updates

The alternative — waiting for server confirmation before updating local state — introduces perceptible latency into every user interaction. On a 200ms round-trip connection, a button press that requires a server mutation feels unresponsive. Users trained by native applications expect instant feedback. Optimistic updates provide this: the UI reflects the change immediately, and the network round-trip happens invisibly in the background.

### Implementation pattern

Before applying an optimistic mutation, the store saves the pre-mutation snapshot of the affected state keys. The mutation is applied immediately. The network request fires concurrently. On success, the saved snapshot is discarded. On failure, the saved snapshot is restored to the store, and an error event is dispatched to notify the user.

```js
async function toggleItemComplete(id, signal) {
  const previous = store.get('items');
  
  // Optimistic: apply immediately
  store.set('items', previous.map(item =>
    item.id === id ? { ...item, completed: !item.completed } : item
  ));

  try {
    await core.api.patch(`/items/${id}`, { completed: !previous.find(i => i.id === id).completed }, { signal });
  } catch (err) {
    // Rollback
    store.set('items', previous);
    core.events.emit('mutation-error', { message: 'Could not update item', detail: err });
  }
}
```

### What state is appropriate for optimistic updates

Not all mutations are candidates for optimistic updates. The appropriate cases are: mutations where the server is highly likely to succeed (toggling a boolean, updating a preference, marking an item complete), mutations whose rollback is visually inexpensive, and mutations where instant feedback significantly improves perceived quality. Mutations with complex server-side validation, destructive operations (deletion that may be constrained by business rules), or financial consequences should wait for server confirmation before updating local state.

---

## 11. Cross-Tab State Consistency

When the application is open in multiple tabs, each tab maintains its own reactive store instance. Without coordination, a mutation in one tab is invisible to others until they reload. For state that must be consistent across tabs — authentication status, user preferences, shared data — `BroadcastChannel` provides the coordination mechanism.

**Spec:** WHATWG HTML Living Standard — BroadcastChannel  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API`  
**Status:** Baseline — Widely Available

When a mutator modifies a state key that is designated as cross-tab, it posts the mutation to a named `BroadcastChannel`. Receiving tabs listen on the same channel and apply the mutation to their own stores using a special internal path that bypasses the re-broadcast to prevent loops.

State that is designated as cross-tab is declared explicitly in the store configuration. The default is no broadcast. Cross-tab synchronisation adds complexity — every mutation on a broadcast key incurs a postMessage call — and is only warranted for state that must actually be consistent across tabs. Most application state is tab-local.

The critical subset of cross-tab state is authentication status. When a user signs out in one tab, all other tabs must reflect the signed-out state immediately. This is the canonical use case for cross-tab synchronisation. Displaying stale authenticated-user UI in a tab after sign-out is a security concern, not just a UX inconvenience.

---

## 12. IndexedDB Schema Versioning

**Spec:** W3C Indexed Database API Level 3  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/IDBOpenDBRequest`

As the application evolves, the structure of its IndexedDB object stores changes: new object stores are added, existing stores gain new indexes, key paths change, and stored data must be migrated to new schemas. IndexedDB manages these changes through a versioning mechanism built directly into the API.

### Version numbers and the upgrade transaction

Every IndexedDB database has an integer version number. Opening the database with a version number higher than the stored version triggers the `upgradeneeded` event. The `upgradeneeded` handler runs inside a `versionchange` transaction — the only transaction type in which object store and index creation and deletion are permitted. Schema changes made outside this transaction throw a `DOMException`.

The version number is a forward-only counter. It is never decremented. Each deployment that changes the schema increments the version by one. The `upgradeneeded` handler applies migrations sequentially from `event.oldVersion` to the new version:

```js
request.onupgradeneeded = (event) => {
  const db = event.target.result;
  const tx = event.target.transaction;

  if (event.oldVersion < 1) {
    db.createObjectStore('items', { keyPath: 'id' });
    db.createObjectStore('preferences', { keyPath: 'key' });
  }
  if (event.oldVersion < 2) {
    const items = tx.objectStore('items');
    items.createIndex('by-status', 'status');
  }
  if (event.oldVersion < 3) {
    // Data migration: add default value for new 'priority' field
    const items = tx.objectStore('items');
    const cursor = items.openCursor();
    cursor.onsuccess = (e) => {
      const c = e.target.result;
      if (!c) return;
      c.update({ ...c.value, priority: c.value.priority ?? 'normal' });
      c.continue();
    };
  }
};
```

Each migration block is guarded by a version check (`if (event.oldVersion < N)`) so that a user on version 1 upgrading to version 3 applies migrations 2 and 3 in sequence, while a user on version 2 upgrading to version 3 applies only migration 3.

### Data migrations within onupgradeneeded

Schema changes that require transforming existing records are performed using cursors within the same `versionchange` transaction. The cursor iterates existing records, applies the transformation, and calls `cursor.update()`. All cursor operations are transactional — if the upgrade transaction fails or the browser crashes mid-migration, the database version is not incremented and the migration re-runs on next open.

This transactional guarantee is the primary reason data migrations must be performed inside `onupgradeneeded` rather than as a post-open migration step. A post-open migration that partially completes before a crash would leave the database in an inconsistent state with no way to detect or re-run the migration.

### Managing the migration registry

Migration code is stored in a version-numbered migration registry: a module that exports an array where each index corresponds to a migration from version `N` to `N+1`. The `onupgradeneeded` handler iterates the registry from `oldVersion` to the new version. This keeps migration logic out of the database open call and makes the full history of schema changes readable as a chronological list.

### The onblocked and onversionchange events

If another tab has an open connection to the same IndexedDB database at the previous version, the `upgradeneeded` event is blocked until that connection is closed. The `blocked` event fires on the upgrade request when this happens. The `versionchange` event fires on the old connection to signal that a new version is waiting. The correct response is to close the old connection and prompt the user to reload if the tab is holding open a connection that blocks the upgrade.

---

## 13. Storage Quota and Eviction

**Spec:** WHATWG Storage Living Standard — StorageManager  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/StorageManager`  
**Status:** Baseline — Widely Available

Browser storage is quota-managed. The browser allocates storage based on available disk space and can evict non-persistent storage to reclaim space, without warning. For production applications that store significant amounts of local data, quota management is not optional.

### Quota estimation

`navigator.storage.estimate()` returns a Promise resolving to an object with `quota` (the estimated total available bytes) and `usage` (the bytes currently used by the origin across all storage mechanisms). This is polled at application startup and before large write operations. The architecture defines a warning threshold — by default 80% of estimated quota — beyond which proactive cleanup begins.

### Persistent storage

By default, browser storage is "best-effort" — the browser can evict it without warning when storage pressure is high. `navigator.storage.persist()` requests that the origin's storage be marked as persistent, which removes it from the browser's eviction candidates. On most browsers, granting persistent storage requires the user to have engaged with the site in a way that suggests intent to return (bookmarked, home-screened, or the browser's own heuristics). The request returns a Promise resolving to `true` if granted or `false` if denied.

Production offline-first deployments must request persistent storage at the appropriate moment in the user journey (after a meaningful action, not immediately on page load). They must also handle the `false` case gracefully — the application must work without persistent storage, with the understanding that stored data may be lost.

### Proactive eviction

When quota usage approaches the warning threshold, the storage layer initiates proactive cleanup in three stages: first, expired Cache API entries with TTL metadata are deleted; second, IndexedDB records with low access recency (tracked by storing a `lastAccessed` timestamp on each record and sorting by this value) are pruned until usage drops below a safe threshold; third, if quota remains critical, the user is notified. The application must not silently lose data without an opportunity for the user to act.

### Quota error handling

Write operations to IndexedDB can fail with a `QuotaExceededError` if quota is exhausted. Every `core.storage.set()` call handles this error explicitly: the error is caught, the quota monitoring module is notified, and the write is added to a retry queue. A retry attempt fires after the proactive cleanup step completes.

---

## 14. State Debugging and Introspection

State management systems that are difficult to inspect produce applications that are difficult to debug. This architecture provides first-class introspection tools.

### `store.snapshot()`

Every store exposes a `snapshot()` method that returns a plain, non-reactive copy of the store's current state. This is used in development tooling, in automated tests (asserting on state after a mutation), and in the state hydration pipeline. Because it is a non-reactive copy, it is safe to log, serialise, or pass across context boundaries.

### `store.history` (development mode only)

In development builds, the store wrapper maintains a bounded ring buffer of state transitions: each entry records the key that changed, the previous value, the new value, and a timestamp. This provides a time-travel debug view without the overhead of a full Redux DevTools-style implementation. The ring buffer is capped at 100 entries and is not present in production builds.

### State event monitoring

All store mutations dispatch a custom event on the global `core/events/bus.js` event bus under the `state:change` type in development mode. External monitoring tools, browser extension devtools panels, and automated integration tests can subscribe to this bus and observe all state transitions without coupling to individual stores.

### Hydration verification

After the startup hydration sequence completes, the storage layer emits a `storage:hydrated` event with a summary of which stores were successfully hydrated and which fell back to defaults. This is logged in development mode and can be used to detect hydration failures that produce silent empty-state bugs.

---

## 15. core.state and core.storage — API Reference

### core.state

```
core.state.create(initial)                 → ReactiveStore
store.get(key)                             → value
store.set(key, value)                      → void
store.batch(fn)                            → void
store.subscribe(key, callback, signal?)    → Disposer
store.derived(keys[], computeFn)           → ComputedValue
store.snapshot()                           → PlainObject
store.hydrate(snapshot)                    → void
store.broadcast(channelName)               → void
```

### core.storage

```
core.storage.get(key)                      → Promise<T | null>
core.storage.set(key, value)               → Promise<void>
core.storage.delete(key)                   → Promise<void>
core.storage.query(store, query)           → Promise<T[]>
core.storage.estimate()                    → Promise<StorageEstimate>
core.storage.persist()                     → Promise<boolean>
core.storage.isPersisted()                 → Promise<boolean>
```

### core.storage schema management (internal, called by core.storage on open)

```
core.storage.registerMigrations(migrations[])  → void
core.storage.currentVersion()                  → number
```

---

## 16. State Management Decision Reference

|Decision|Correct approach|
|---|---|
|State that affects the current view and must survive reload|URL State — encode in search parameters via `URLSearchParams`|
|State that must be shareable via link|URL State|
|Paginated list position|URL State (`?page=N`)|
|Active filter/sort selection|URL State|
|Which dropdown is open|Session State (reactive store)|
|In-progress form that should be abandoned on reload|Session State|
|Working copy of data being edited|Session State, with periodic write to IndexedDB|
|User preferences|Persistent Local State (IndexedDB)|
|Cached remote data for offline use|Persistent Local State (IndexedDB)|
|Auth tokens|Persistent Local State (IndexedDB, persistent tier)|
|Offline-queued mutations|Persistent Local State (IndexedDB, pending operations store)|
|Data fetched from server|Remote State — materialised into Persistent Local or Session State after fetch|
|State that must be consistent across tabs|Persistent Local State + BroadcastChannel broadcast|
|Multiple keys that must change atomically|`store.batch(fn)`|
|Mutation that must be durable before applying|Write-ahead pattern: write to IndexedDB, then update reactive store|
|Mutation appropriate for optimistic update|Apply to store immediately, rollback on server error|
|Adding a new object store or index|Increment the IndexedDB version, add migration block|
|Detecting storage pressure|`navigator.storage.estimate()` at startup and before large writes|
|Preventing browser eviction of local data|`navigator.storage.persist()` after meaningful user engagement|

---

## Standards and References

- WHATWG URL Living Standard — URLSearchParams: `url.spec.whatwg.org`
- WHATWG HTML Living Standard — BroadcastChannel: `html.spec.whatwg.org/#dom-broadcastchannel`
- WHATWG Storage Living Standard — StorageManager: `storage.spec.whatwg.org`
- W3C Indexed Database API Level 3: `w3.org/TR/IndexedDB-3`
- MDN — URLSearchParams: `developer.mozilla.org/en-US/docs/Web/API/URLSearchParams`
- MDN — IndexedDB API: `developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API`
- MDN — StorageManager: `developer.mozilla.org/en-US/docs/Web/API/StorageManager`
- MDN — BroadcastChannel: `developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API`
- MDN — Cache-Control stale-while-revalidate: `developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control`
- web.dev — Keeping things fresh with stale-while-revalidate: `web.dev/articles/stale-while-revalidate`
- Smashing Magazine — The Architecture of Local-First Web Development (May 2026): `smashingmagazine.com/2026/05/architecture-local-first-web-development`
- InfoQ — Type-Safe URL State Management, React Advanced 2025: `infoq.com/news/2025/12/nuqs-react-advanced`