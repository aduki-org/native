# Storage Engine Architecture Plan

This document outlines the blueprint for the local-first Multi-Tier Storage Gateway within `core.storage`, mapping memory LRU, IndexedDB, Cache API, and Origin Private File System (OPFS) under a unified tiered facade.

---

## 1. Architectural Architecture & Requirements

We will structure `core.storage` to provide:
1. **Tiered Storage Architecture:** Clean separation of data structures into Memory LRU (transient, near-instant), IndexedDB (default transactional storage), Cache API (Request/Response persistence), and OPFS (high-performance synchronous file systems).
2. **Synchronous Storage Ban:** Prevent performance-degrading synchronous operations (like blocking localStorage reads) in user interaction loops to keep the Interaction to Next Paint (INP) score pristine.
3. **Dedicated Web Worker Offloading:** Route heavy OPFS synchronous file operations (using `FileSystemSyncAccessHandle`) to a background Dedicated Web Worker to eliminate main thread contention.
4. **Cross-Tab Invalidation:** Broadcast storage mutations across tabs in real-time utilizing a native `BroadcastChannel` named `core:opfs-invalidation` or namespace channels.
5. **Quota Governance & Self-Healing:** Integrate the browser's native `StorageManager` to monitor space estimates, query persistence, request persistent storage (`navigator.storage.persist()`), and fire events on 80% quota usage limits.

---

## 2. Directory Layout & Core Components

Following `RULE[user_global]`, the storage components are flat and named using lowercase:

```
src/core/storage/
├── index.js          # Unified Storage Gateway Entry (core.storage)
├── idb.js            # Promise-wrapped transactional IndexedDB client
├── lru.js            # Least-Recently-Used & WeakRef memory caching stores
├── opfs.js           # Dedicated Web Worker coordinator for OPFS access
├── quota.js          # StorageManager quota checks and persistence control
└── plan.md           # This planning blueprint
```

---

## 3. Technical Blueprint & Multi-Tier Mapping

### Tier Performance Matrix

| Tier | API Backend | Performance | Thread Scoped | Use Case |
|---|---|---|---|---|
| `memory` | Map / WeakRef | Sub-microsecond | Main / Worker | Ephemeral/transient cache |
| `idb` | IndexedDB | 1ms – 5ms | Main / Worker | Structured user/document databases |
| `cache` | Cache API | 2ms – 10ms | Main / Worker | Offline Request/Response caching |
| `opfs` | OPFS Access Handle | Sub-millisecond | Dedicated Worker | Large sequential writes, SQLite storage |

### Unified Storage Gateway Contracts

```javascript
// src/core/storage/index.js
export const storage = {
  async get(key, tier = 'idb') { ... },
  async set(key, value, tier = 'idb', ttl = null) { ... },
  async delete(key, tier = 'idb') { ... },
  async list(tier = 'idb') { ... },
  async clear(tier = 'all') { ... }
};
```

---

## 4. Verification Plan

### Automated Verification
- Verify database migrations run sequentially on database opening without skipping steps.
- Validate that WeakRef memory cache recovers objects when available and handles garbage collection gracefully under memory pressure.
- Confirm background Dedicated Worker file operations complete correctly without stalling the main thread.
- Assert that cross-tab signals are successfully broadcasted and received during file operations.

### Quota Checks
- Validate that the quota manager detects when usage climbs past 80% and fires an eviction warning event.
