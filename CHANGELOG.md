# Changelog

All notable changes to `@adukiorg/native` will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Planned
- JSDoc `@typedef` + `.d.ts` type declarations for all core modules
- Service Worker integration helpers (`src/sw/`)
- Design token CSS custom property pipeline (`src/tokens/`)
- Full element library documentation (`src/elements/`)

---

## [0.1.0] — 2026-05-27

### Added

#### Package
- Published as `@adukiorg/native` — pure browser ESM, zero build step
- Scoped subpath exports for every core module (`/api`, `/state`, `/storage`, etc.)
- `"type": "module"` — fully native ESM, no CommonJS wrapper
- `npm test` via `@web/test-runner` (real Chromium, no jsdom)
- `npm run serve` via `@web/dev-server` on port 8080

#### Core — `@adukiorg/native/api`
- `execute()` — fetch wrapper with AbortSignal, timeout, and `scheduler.postTask` integration
- `PlatformError` — unified error shape across all network failures
- `retry()` — exponential backoff with jitter and AbortSignal support
- `stream()` — async generator streaming over NDJSON responses
- `createNDJSONTransform()` — reusable `TransformStream` for NDJSON parsing
- `upload()` — multipart file upload with progress events
- `pipeline` — composable request/response middleware pipeline
- Cache strategies: `cache-first`, `network-first`, `stale-while-revalidate`

#### Core — `@adukiorg/native/state`
- `ReactiveStore` — Proxy-based reactive state with microtask-batched notifications
- `setActiveSubscriber` / `getActiveSubscriber` — dependency tracking context
- `derived()` — auto-tracked computed values that re-evaluate on dependency changes
- `sync()` — BroadcastChannel cross-tab state synchronization

#### Core — `@adukiorg/native/events`
- `EventBus` — typed pub/sub with wildcard patterns and AbortSignal cleanup
- `events` — singleton global event bus instance

#### Core — `@adukiorg/native/router`
- `register()` / `match()` — URL pattern registration and matching
- `clear()` / `getRoutes()` — route registry management
- `addGuard()` — async navigation guard hooks
- `setNotFound()` — 404 handler
- `setup()` — bootstraps native Navigation API interception
- Full programmatic history API: `navigate`, `replace`, `back`, `forward`, `go`, `current`, `entries`
- `renderOutlet()` — declarative route outlet rendering

#### Core — `@adukiorg/native/storage`
- `Database` — Promise-wrapped IndexedDB with sequential migrations
- `LRUCache` / `WeakLRUCache` — in-memory LRU caches with optional TTL
- `storage` — unified tiered facade: memory → IndexedDB → Cache API → OPFS
- `quota` — storage estimate and persistence request helpers

#### Core — `@adukiorg/native/offline`
- `queue` — IndexedDB-backed offline operation queue with FIFO dequeue
- `check()` / `subscribe()` — connectivity detection and change subscriptions

#### Core — `@adukiorg/native/animations`
- `animate()` — WAAPI wrapper with AbortSignal and easing controls
- `stagger()` — staggered multi-element animation groups with `finished` promise

#### Core — `@adukiorg/native/workers`
- `lock()` — Web Locks API facade with timeout and AbortSignal support
- `WorkerPool` — managed pool of Web Workers with task queue and concurrency limits

#### Core — `@adukiorg/native/security`
- `sanitize()` — XSS-safe HTML sanitizer using `DOMParser`
- `uuid()` — `crypto.randomUUID()` wrapper
- `hash()` — SHA-256/384/512 via Web Crypto API
- `generateKey()` / `deriveKey()` — AES-GCM key generation and PBKDF2 derivation
- `encrypt()` / `decrypt()` — AES-GCM symmetric encryption/decryption

#### Core — `@adukiorg/native/platform`
- `supports` — feature detection registry for 30+ browser APIs
- `reset()` — cache reset utility (used in tests)

#### Core — `@adukiorg/native/ui`
- `BaseElement` — Shadow DOM base class for all custom elements
- Design token cascade: primitive → semantic → component token layers

#### Tests
- 26 test suites, 70 assertions — all running in real Chromium via `@web/test-runner`
- Browser-native import maps injected per test run — no Node.js module resolution

#### Blog Demo
- `blog/` — sample SPA demonstrating state, storage, offline queue, and animations
- Import map mirrors the published `@adukiorg/native/*` subpath exports exactly

[Unreleased]: https://github.com/aduki-org/native/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/aduki-org/native/releases/tag/v0.1.0
