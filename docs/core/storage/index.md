# Unified Storage Gateway Documentation

## Purpose and Architectural Position
The `storage` module (`src/core/storage/index.js`) operates as a cohesive, tiered persistence layer. It structures client-side storage across four distinct latency tiers—Memory (LRU Cache), Cache API (HTTP Responses), IndexedDB (Transactional Data), and OPFS (Raw Filesystem Access)—binding them behind a unified, simple API surface.

## Public API Surface with Examples

```javascript
import { storage } from 'lib/core/storage/index.js';

// 1. Transactional Write with automatic LRU Memory cache promotion
await storage.set('user:profile', { name: 'fescii' }, 'idb');

// 2. High-Performance Read
const profile = await storage.get('user:profile', 'idb');

// 3. Write structured binary file data to OPFS
await storage.set('documents/report.pdf', pdfBlob, 'opfs');

// 4. advanced IndexedDB Index Queries
const results = await storage.query('keyval', {
  limit: 20
});
```

## AbortSignal and Cleanup Contract
* **IndexedDB Transactions**: Runs completely inside scoped transaction contexts. Any execution block error triggers an immediate rollback to preserve relational sanity.
* **LRU memory Caches**: Evicts Least-Recently-Used assets automatically when exceeding sizes or custom expirations (TTL) to manage garbage collection gracefully.

## Known Browser Gaps and Polyfill Strategy
* **Origin Private File System (OPFS)**: Available on modern standard environments. If OPFS is unsupported, file storage operations gracefully fall back to storing blobs inside IndexedDB.
* **Quota Estimation**: Leverages `navigator.storage.estimate()`. If missing, the module returns standard mock values.
