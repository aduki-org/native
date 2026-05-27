## Networking Architecture

**Spec authority:** WHATWG Fetch Living Standard, WHATWG Streams Living Standard, WHATWG HTML Living Standard (EventSource), W3C Web Cryptography API Level 2 **Status:** Fetch API — Baseline Widely Available. Streams API — Baseline Widely Available. AbortSignal static methods — Baseline Newly Available 2024. EventSource — Baseline Widely Available. WebSocket — Baseline Widely Available. SubtleCrypto — Baseline Widely Available.

---

## Table of Contents

1. [Philosophy and Scope](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#1-philosophy-and-scope)
2. [The core.api Namespace](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#2-the-coreapi-namespace)
3. [The Fetch API Foundation](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#3-the-fetch-api-foundation)
4. [Request Lifecycle Pipeline](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#4-request-lifecycle-pipeline)
5. [Outbound Interceptors](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#5-outbound-interceptors)
6. [Cache Layer](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#6-cache-layer)
7. [AbortSignal and Request Cancellation](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#7-abortsignal-and-request-cancellation)
8. [Retry and Backoff](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#8-retry-and-backoff)
9. [Response Interceptors and Error Normalisation](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#9-response-interceptors-and-error-normalisation)
10. [Request Deduplication](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#10-request-deduplication)
11. [Streams API and Progressive Responses](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#11-streams-api-and-progressive-responses)
12. [Server-Sent Events](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#12-server-sent-events)
13. [WebSockets and the SharedWorker Pool](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#13-websockets-and-the-sharedworker-pool)
14. [Upload Handling and the XHR Gap](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#14-upload-handling-and-the-xhr-gap)
15. [SubtleCrypto Request Signing](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#15-subtlecrypto-request-signing)
16. [What the Networking Layer Does Not Own](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#16-what-the-networking-layer-does-not-own)

---

## 1. Philosophy and Scope

The networking layer is a composable pipeline built on top of the platform's `fetch()` API. It does not reimplement `fetch`; it wraps it with the lifecycle concerns that every production application requires: authentication, caching, cancellation, retry, error normalisation, and streaming. Every concern is addressed by a deterministic stage in an ordered pipeline. No stage has implicit knowledge of another.

The layer is not a library. It is a set of modules in `core/api/` that call platform APIs directly. The full dependency chain terminates at `fetch()`, `ReadableStream`, `EventSource`, `WebSocket`, and `SubtleCrypto` — all browser primitives defined in specifications, not in third-party code.

Two constraints govern all decisions in this layer. First, requests are cancellable: every outgoing operation carries an `AbortSignal` and is terminated when that signal fires. Second, the network is not assumed to be available: the layer integrates with the Cache API and the offline engine so that reads can be served from cache and writes can be queued when connectivity is absent. These are not optional features; they are invariants.

---

## 2. The core.api Namespace

The public API surface of the networking layer is a flat namespace of async functions exported from `core/api/index.js`:

```
core.api.get(url, options)
core.api.post(url, body, options)
core.api.put(url, body, options)
core.api.patch(url, body, options)
core.api.delete(url, options)
core.api.stream(url, options)
core.api.upload(url, file, options)
```

All methods except `stream` return a `Promise` that resolves to a plain data object (the parsed response body). `stream` returns an async iterable backed by a `ReadableStream` for progressive consumption. `upload` returns a `Promise` backed by `XMLHttpRequest` for upload progress tracking (see Section 14).

The `options` object accepted by every method follows a consistent shape:

`signal` — an `AbortSignal`. If provided, it is composed with the pipeline's internal timeout signal using `AbortSignal.any()`. If not provided, the pipeline uses `AbortSignal.timeout(defaultTimeout)` alone.

`cache` — a string naming the caching strategy: `'cache-first'`, `'network-first'`, `'stale-while-revalidate'`, or `'network-only'`. Defaults to `'network-first'` for mutation methods (POST, PUT, PATCH, DELETE) and `'stale-while-revalidate'` for GET requests to known idempotent endpoints. The route or store that initiates the request specifies the correct strategy for its data type; the pipeline honours it without making this determination itself.

`auth` — a boolean. If `true`, the authentication interceptor runs. Defaults to `true`. Set to `false` for public endpoints that do not require a token.

`sign` — a boolean. If `true`, the request is HMAC-signed using the SubtleCrypto pipeline stage. Defaults to `false`. Required for endpoints with message-integrity requirements.

`retries` — a number. Maximum retry attempts for transient failures. Defaults to 3. Set to 0 for operations that must not be retried (non-idempotent mutations where retry safety is uncertain).

`correlationId` — a string. If not provided, the pipeline generates a UUID and attaches it as `X-Correlation-ID`. This propagates through distributed traces and is essential for log correlation.

---

## 3. The Fetch API Foundation

**Spec:** WHATWG Fetch Living Standard **MDN:** `developer.mozilla.org/en-US/docs/Web/API/Fetch_API` **Status:** Baseline Widely Available.

`fetch(url, init)` is the platform's standard HTTP client. It returns a `Promise<Response>`. The `Response` object's `body` property is a `ReadableStream`, making streaming a zero-abstraction operation on any `fetch` response. The `Response` also carries `status`, `headers`, `ok` (boolean for 200–299 range), and body-consumption methods (`json()`, `text()`, `blob()`, `arrayBuffer()`, `formData()`).

The pipeline calls `fetch()` once per attempt within the retry loop. The pipeline does not wrap `fetch()` in a constructor or class. It passes a `Request` object built from the accumulated options of all preceding interceptor stages, so the final call is always `fetch(request)` — transparent, inspectable in DevTools, and identical in structure to a raw fetch call.

Every `Response` body can only be consumed once. If the response body needs to be read at multiple pipeline stages (e.g., logging and parsing), a `response.clone()` call creates a second `Response` sharing the same underlying stream without consuming the original. Cloning is done at most once per response, immediately after the network stage, before passing the response to any interceptor.

The `keepalive` fetch option — which allows a request to outlive the page — is used for analytics and telemetry requests initiated during `pagehide` or `visibilitychange` events. These are requests where losing the page lifecycle would otherwise silently drop the data.

---

## 4. Request Lifecycle Pipeline

Every request processed by `core.api` passes through a fixed, ordered sequence of pipeline stages. Each stage is a pure function that receives a `RequestDescriptor` (a plain object accumulating all request parameters) and either passes it along, modifies it, or short-circuits with a cached `Response`.

```
Caller
  │
  ▼
[1] Outbound Interceptors
    - Auth header injection
    - Request signing (SubtleCrypto HMAC)
    - Correlation ID attachment
  │
  ▼
[2] Cache Layer (GET/HEAD only)
    - Cache-first: return cached Response if valid
    - Stale-while-revalidate: return cached, revalidate in background
    - Network-first: pass through, cache on success
    - Network-only: pass through, no cache read
  │
  ▼
[3] Network
    - Build Request object from descriptor
    - fetch(request, { signal })
    - Exponential backoff retry loop
  │
  ▼
[4] Response Interceptors
    - HTTP error detection (non-ok status → throw typed error)
    - Error normalisation (map status codes to domain error types)
    - Rate-limit header parsing (Retry-After, X-RateLimit-*)
    - Schema validation (optional, per-endpoint)
    - Cache population (on successful GET responses)
  │
  ▼
Consumer (component, store, route handler)
```

The pipeline is not a class with middleware registration. It is a `compose()` utility applied to an ordered array of stage functions at module initialisation time. Adding or removing a stage means modifying the array at one location. No stage registers itself; all stages are declared explicitly.

---

## 5. Outbound Interceptors

### Authentication Header Injection

The auth interceptor reads the current access token from the session state layer (not from `localStorage` — token storage is the security module's concern and is handled via a secure, non-persistent in-memory store). It adds an `Authorization: Bearer <token>` header to the request descriptor.

If the token is absent (user not authenticated) and `options.auth` is `true`, the interceptor rejects the pipeline immediately with a typed `UnauthenticatedError`. This prevents requests from silently failing at the server with a 401 after a round trip.

If the token is present but expired according to its locally decoded expiry claim, the interceptor attempts a silent refresh before proceeding. The refresh itself is a `core.api.post()` call to the token endpoint with `auth: false` to avoid a circular dependency. If the refresh succeeds, the new token is stored and the original request proceeds with the refreshed token. If the refresh fails, the pipeline rejects with a typed `SessionExpiredError` and dispatches the `auth:sessionexpired` event on the application bus.

Token refresh calls are deduplicated: if two concurrent requests both detect a stale token and attempt a refresh simultaneously, only one refresh request is made; both waiters receive the same result (see Section 10 for the deduplication mechanism).

### Correlation ID

A `X-Correlation-ID` header carrying a UUID is attached to every request. If the caller provides a `correlationId` in `options`, that value is used. Otherwise, `crypto.randomUUID()` generates one. This header is essential for correlating frontend-initiated requests with server-side traces in distributed logging systems.

`crypto.randomUUID()` is available in all modern browsers in secure contexts and does not require an import or polyfill. It is the correct API for generating UUIDs; manual UUID construction from `Math.random()` has inadequate entropy for correlation purposes.

### Request Signing

When `options.sign` is `true`, the outbound interceptor computes an HMAC-SHA-256 signature over the canonical request representation (method, URL, body hash, timestamp) using the SubtleCrypto API (see Section 15). The signature is attached as an `X-Request-Signature` header. The server verifies this signature to assert that the request originated from a trusted client context and has not been tampered with in transit.

---

## 6. Cache Layer

**Spec:** WHATWG Fetch — Cache API **MDN:** `developer.mozilla.org/en-US/docs/Web/API/Cache` **Status:** Baseline Widely Available (in both main thread and Service Worker contexts).

The Cache API provides a named persistent key-value store mapping `Request` objects to `Response` objects. It is distinct from the HTTP cache managed by the browser; it is a programmable cache under application control.

The networking layer opens named caches keyed by API domain: `api-v1-content`, `api-v1-user-data`, and so on. The cache name encodes the API version so that a version bump causes all existing cached responses to be treated as misses without requiring explicit invalidation.

### Cache-First

Check the cache for the request. If a valid cached `Response` exists, return it immediately without touching the network. If the cache has no entry, fetch from the network, cache the response, and return it.

This strategy is appropriate for resources that change infrequently and where stale data has no meaningful negative consequence: reference data, configuration tables, static content lists. The trade-off is explicit: the user always receives the fastest possible response, but that response may be out of date until the cache entry expires or is explicitly invalidated.

### Network-First

Attempt the network request. On success, update the cache and return the fresh response. If the network request fails (connection refused, timeout, non-retryable error), serve the most recent cached response if available; otherwise propagate the error.

This strategy is appropriate for resources where freshness is critical but offline fallback is still valuable: user-specific data, shopping carts, notification counts. The user always gets fresh data when online, and stale data when offline rather than nothing.

### Stale-While-Revalidate

Serve the cached response immediately (if available) and simultaneously issue a background network request to update the cache. The caller receives the stale response without waiting for the network. The cache is updated when the background request completes; the next call will receive the fresher data.

This strategy is appropriate for resources where perceived performance is paramount and brief staleness is acceptable: content feeds, timelines, leaderboards, search results. It eliminates the perceived latency of waiting for a network response at the cost of a brief window where the displayed data may be one generation behind.

The background revalidation request shares no `AbortSignal` with the foreground caller. It uses a standalone `AbortSignal.timeout(backgroundTimeout)` and is initiated with `scheduler.postTask('background')` to avoid contending with user-facing work.

### Network-Only

Bypass the cache entirely for both reads and writes. Used for mutation endpoints (POST, PUT, PATCH, DELETE by default) and for any GET endpoint where cached responses would be actively harmful (e.g., a payment status check).

### Cache Invalidation

Cache entries are invalidated explicitly when mutations succeed. The mutation pipeline stage identifies which cache entries are stale by URL prefix matching and calls `cache.delete(request)` on all matching entries. This is not automatic; each POST/PUT/PATCH endpoint's options declare which cache prefix patterns it invalidates. The declaration is in the route or store that calls `core.api`, not in the pipeline itself.

---

## 7. AbortSignal and Request Cancellation

**Status:** AbortController — Baseline Widely Available. `AbortSignal.any()` — Baseline Newly Available March 2024. `AbortSignal.timeout()` — Baseline Newly Available April 2024. Both available in Web Workers.

Every request in the pipeline carries a composed `AbortSignal`. The composition combines the caller-provided signal (if any) with a built-in timeout signal:

```js
const composedSignal = options.signal
  ? AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
  : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
```

This means every request has a maximum lifetime of `REQUEST_TIMEOUT_MS` (configurable per endpoint), regardless of whether the caller cancels it. And every caller-initiated cancellation (component unmount, route change, user action) propagates through to the in-flight network request without any additional bookkeeping.

When the signal fires, `fetch()` rejects with a `DOMException` whose `name` is either `AbortError` (caller-cancelled) or `TimeoutError` (timeout-cancelled). The error handler in the pipeline distinguishes these cases:

`AbortError` is silent. If a request is cancelled because the component that initiated it was unmounted, there is nothing to display to the user and nothing to log. The rejection propagates to the caller and is caught by the caller's abort-aware error handler.

`TimeoutError` is treated as a transient failure and enters the retry loop if retries remain, otherwise it surfaces as a typed `NetworkTimeoutError` to the caller.

### Component Lifecycle Cancellation

Requests initiated by components pass the component's lifecycle `AbortController` signal as `options.signal`. When the component is disconnected, `controller.abort()` fires, and any in-flight requests for that component are immediately cancelled. This prevents the class of bug where a slow request resolves after a component has been removed and attempts to update state that no longer has a valid rendering target.

### Store-Level Cancellation

Requests initiated by the state layer (not tied to a single component's lifecycle) are managed by a per-resource controller: when a new request for the same resource key is initiated, the previous controller is aborted before the new request begins. This implements "take latest" semantics at the network level — only the most recent request for a given resource can win, regardless of response order.

---

## 8. Retry and Backoff

The retry stage wraps the network call in a loop that attempts the request up to `options.retries` times before propagating a failure to the caller.

### Retryable Status Codes

Not all failures warrant a retry. Permanent client errors (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable Entity) represent problems with the request itself; retrying the same request will produce the same result and must not be attempted.

Transient server errors are retryable: 429 Too Many Requests, 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout. Network errors (connection refused, DNS failure) are also retryable.

`AbortError` and `TimeoutError` are not automatically retried. A `TimeoutError` may be retried if the caller's `options.retries` allows it and the composed signal has not yet fired, but each retry resets the timeout — it does not accumulate time across attempts.

### Exponential Backoff with Jitter

Between retry attempts, the pipeline waits for a computed delay before re-attempting:

```
delay = min(BASE_DELAY_MS * 2^attempt, MAX_DELAY_MS) + jitter
```

Where `jitter` is a random value in `[0, BASE_DELAY_MS]`. The jitter term is essential: without it, multiple clients that experience the same failure simultaneously will retry at the same moment, producing a coordinated burst of traffic that can prevent the server from recovering. Jitter distributes the retry population across the backoff window.

`BASE_DELAY_MS` defaults to 500ms. `MAX_DELAY_MS` defaults to 30 seconds. These are configurable per-endpoint to accommodate APIs with known SLA characteristics.

### Retry-After Header

When a `429 Too Many Requests` response includes a `Retry-After` header, the pipeline uses the specified value as the delay for the next attempt rather than the computed exponential delay. The `Retry-After` value may be either a number of seconds or an HTTP-date string; the pipeline handles both forms.

```js
const retryAfter = response.headers.get('Retry-After');
if (retryAfter) {
  const parsed = Date.parse(retryAfter);
  delay = isNaN(parsed)
    ? parseInt(retryAfter, 10) * 1000
    : parsed - Date.now();
}
```

If `Retry-After` is present and specifies a delay longer than `MAX_DELAY_MS`, the request is not retried — the server has communicated that the delay would be unacceptable for the user experience context.

### Idempotency and Retry Safety

Only idempotent requests are retried by default. GET, HEAD, OPTIONS, and DELETE are idempotent. PUT is conditionally idempotent (only if the server enforces it). POST and PATCH are generally not idempotent.

The `retries` option for POST and PATCH defaults to 0. Callers that know a specific POST endpoint is idempotent (e.g., an idempotency-key-based payment API) can set `retries` explicitly. The pipeline does not infer idempotency from the HTTP method alone when the caller overrides the default; that inference is the caller's responsibility.

---

## 9. Response Interceptors and Error Normalisation

### HTTP Error Detection

A `Response` with `response.ok === false` (status code outside 200–299) is treated as a request failure. The Fetch API does not throw on non-ok responses; the application layer must check `response.ok` explicitly. The pipeline does this in the response interceptor, converting HTTP error statuses into typed JavaScript errors before they reach the caller.

The mapping:

- 400 → `ValidationError` (carries the response body as parsed error detail)
- 401 → `UnauthenticatedError`
- 403 → `ForbiddenError`
- 404 → `NotFoundError`
- 409 → `ConflictError`
- 422 → `UnprocessableError` (carries parsed validation field errors)
- 429 → `RateLimitError` (carries `Retry-After` if present)
- 500 → `ServerError`
- 502, 503, 504 → `ServiceUnavailableError`
- All others → `HttpError` with `status` and `statusText` properties

All error types extend a common `NetworkError` base class. Callers that need to distinguish between error categories can use `instanceof` checks; callers that only need to detect any network failure catch `NetworkError`.

### Rate-Limit Header Parsing

The response interceptor reads rate-limit headers (the de-facto `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` convention) from every response and stores them in a rate-limit state object keyed by host. Components or stores that display rate-limit state (e.g., an API usage meter in a developer console) can read from this state object via the reactive state layer without inspecting raw response headers themselves.

### Schema Validation

Per-endpoint schema validation is optional and disabled by default. When enabled, the parsed response body is validated against a declared schema before being returned to the caller. Validation failure produces a `SchemaValidationError` rather than propagating malformed data into application state. This is most valuable at API boundaries where the server's contract is known to drift or where response shapes differ by feature flag.

---

## 10. Request Deduplication

Concurrent requests to the same URL with the same parameters, initiated within the same event loop turn or within a configurable deduplication window, are deduplicated by the pipeline: only one actual `fetch()` call is made, and all callers receive the same resolved value when it settles.

The deduplication mechanism is a `Map` keyed by a canonical cache key string. The value is the in-flight `Promise<Response>` for that key. When a new request arrives for a key that is already in the map, the pipeline returns the existing promise rather than creating a new `fetch()` call. When the in-flight promise settles (success or failure), its entry is removed from the map.

```js
const inFlight = new Map();

async function dedupedFetch(key, requestFn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = requestFn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
```

This is applied only to GET and HEAD requests. POST, PUT, PATCH, and DELETE requests are never deduplicated. The deduplication window is a single event loop cycle; requests separated by even one microtask tick are not considered concurrent in this context.

The most important application of deduplication is token refresh: two concurrent authenticated requests that both detect a stale token will trigger only one refresh, and both will await its result. Without deduplication, both would attempt a refresh simultaneously, and one would succeed while the other would likely fail with a race condition.

---

## 11. Streams API and Progressive Responses

**Spec:** WHATWG Streams Living Standard **MDN:** `developer.mozilla.org/en-US/docs/Web/API/Streams_API` **Status:** Baseline Widely Available. Async iteration over `ReadableStream` — supported in all major browsers.

### response.body as a ReadableStream

Every `fetch()` response's `body` property is a `ReadableStream<Uint8Array>`. For most requests, the pipeline consumes the full body with `response.json()` or `response.text()`. For streaming endpoints, `core.api.stream()` returns the body stream directly to the caller rather than buffering it.

The distinction matters for large payloads: a 10MB JSON response buffered with `response.json()` occupies 10MB of memory at once. The same response consumed via `response.body` occupies only as much memory as the current chunk being processed — the rest remains in the network buffer managed by the browser.

### Streaming Pipeline with TransformStream

For endpoints that return newline-delimited JSON (NDJSON), CSV streams, or other chunked text formats, a `TransformStream` is inserted between the network's `ReadableStream` and the caller's async iterator. The transform stage decodes `Uint8Array` chunks to strings (`TextDecoderStream`), accumulates partial lines, splits on line boundaries, and parses each complete line as the format requires.

```
response.body (ReadableStream<Uint8Array>)
  │
  ├─ pipeThrough(new TextDecoderStream())
  │    → ReadableStream<string>
  │
  ├─ pipeThrough(new LineTransformStream())
  │    → ReadableStream<string> (complete lines only)
  │
  └─ pipeThrough(new JSONParseTransformStream())
       → ReadableStream<Object>
```

The caller receives a `ReadableStream<Object>` and consumes it with `for await...of`. Each iteration produces a parsed record the moment it arrives from the network, without waiting for the full response.

### Backpressure

Backpressure is a first-class concern of the Streams API and requires no userland implementation. When a consumer processes chunks slower than the network delivers them, the stream's internal queue fills until it reaches the high-water mark. At that point, `ReadableStreamDefaultController.desiredSize` drops below zero, and the upstream producer slows its enqueue rate. The `pipeThrough()` and `pipeTo()` methods propagate this signal through the entire WebTransport￼￼ pipeline chain automatically.

This eliminates the need for manual flow control (e.g., pausing a stream when the UI is busy) — the platform manages it, and the correct behaviour is obtained by simply using the piping APIs as specified.

### AI Streaming Responses

Streaming is the correct pattern for LLM-generated content, where the server begins emitting tokens before the full response is complete. A `core.api.stream()` call to an LLM endpoint returns an async iterable that yields decoded text chunks as they arrive. The consuming component appends each chunk to the DOM incrementally, producing the typewriter effect that characterises LLM interfaces without any custom buffering, debouncing, or rendering coordination.

---

## 12. Server-Sent Events

**Spec:** WHATWG HTML Living Standard — Server-Sent Events **MDN:** `developer.mozilla.org/en-US/docs/Web/API/EventSource` **Status:** Baseline Widely Available. All major browsers.

`EventSource` establishes a persistent unidirectional HTTP connection over which the server pushes events. The content type is `text/event-stream`. The protocol is text-based and human-readable. `EventSource` is the correct choice when the communication pattern is server-to-client only and where the bidirectional overhead of WebSockets would be wasted.

### Connection and Reconnection

The `EventSource` constructor accepts the endpoint URL and an optional `withCredentials: true` option for cross-origin authenticated streams. The browser opens the connection immediately and manages the connection lifecycle: it automatically reconnects when the connection drops, by default after 3 seconds (a value the server can override with the `retry:` field in the event stream). On reconnection, the browser sends a `Last-Event-ID` header containing the `id` of the last event it successfully received, allowing the server to resume the stream without gaps.

This automatic reconnection with resume semantics is provided at zero implementation cost. An equivalent WebSocket implementation requires explicit reconnection logic, sequence tracking, and message replay — the `EventSource` protocol specifies this behaviour and all conforming browsers implement it.

### Typed Events

The SSE wire format supports named event types via the `event:` field. Named events are subscribed to via `source.addEventListener('event-type', handler)`, just like DOM events. The generic `onmessage` handler receives only events without an `event:` field. Using named events is preferred: it makes the event taxonomy explicit and allows a single `EventSource` connection to carry multiple distinct event types to different consumers.

```js
const source = new EventSource('/api/realtime');

source.addEventListener('inventory:updated', (event) => {
  const payload = JSON.parse(event.data);
  store.dispatch('inventory/update', payload);
});

source.addEventListener('price:changed', (event) => {
  const payload = JSON.parse(event.data);
  store.dispatch('pricing/update', payload);
});

source.onerror = () => {
  // EventSource reconnects automatically; this fires on every interruption
  // Log the event but do not attempt manual reconnection
};
```

### Lifecycle and Cleanup

`EventSource` connections are explicitly closed with `source.close()`. The connection is not automatically closed when a component is removed. The component's `disconnectedCallback` must close any `EventSource` it opened:

```js
connectedCallback() {
  this.#source = new EventSource('/api/stream');
  this.#source.addEventListener('data', this.#handleData, {
    signal: this.#controller.signal
  });
}

disconnectedCallback() {
  this.#controller.abort(); // removes event listeners
  this.#source.close();     // closes the HTTP connection
  this.#source = null;
}
```

### EventSource vs Fetch Streaming

`EventSource` and `fetch()` with `response.body` streaming solve related but different problems. `EventSource` provides automatic reconnection, event IDs, and named event types over a long-lived connection, but the content must be `text/event-stream` format and the connection is exclusively server-to-client. `fetch()` streaming provides a one-shot response body as a `ReadableStream`, suitable for consuming a single large or chunked response without a persistent connection. Use `EventSource` for ongoing push subscriptions; use `fetch()` streaming for consuming a single large or progressively-delivered response.

### HTTP/2 Connection Multiplexing

Under HTTP/2, an `EventSource` connection is multiplexed with all other same-origin requests over a single TCP connection. The browser's 6-connection-per-origin limit that constrained HTTP/1.1 SSE deployments does not apply to HTTP/2. Applications that previously opened only one SSE connection per page out of concern for the connection limit can now open multiple named streams for different domains without that concern — assuming an HTTP/2 or HTTP/3 server.

---

## 13. WebSockets and the SharedWorker Pool

**Spec:** WHATWG HTML Living Standard — WebSocket **Status:** Baseline Widely Available.

WebSocket provides a full-duplex persistent connection for bidirectional communication. It is the appropriate transport when the client must also send messages to the server in real time: collaborative editing, chat, multiplayer features, live dashboards with client-initiated controls.

### The Connection Cost Problem

Each tab that opens its own `WebSocket` to the server creates a distinct TCP connection and a distinct server-side session object. An application with 10 tabs open creates 10 connections and 10 server-side session objects. Under HTTP/1.1 this was unavoidable, but the browser now provides two mechanisms to share a single connection across tabs: `SharedWorker` and `BroadcastChannel`.

### SharedWorker Architecture

A `SharedWorker` is a Worker that runs in a single background thread shared by all same-origin tabs. The WebSocket connection is opened inside the `SharedWorker`. Each tab connects to the `SharedWorker` via a port (`sharedWorkerInstance.port`), not to the WebSocket directly. The `SharedWorker` acts as a multiplexer: messages from the server are broadcast to all connected ports; messages from any tab are forwarded to the server over the single connection.

Inside the `SharedWorker`:

```js
const connections = new Set();
const ws = new WebSocket(WS_ENDPOINT);

self.addEventListener('connect', (event) => {
  const port = event.ports[0];
  connections.add(port);

  port.addEventListener('message', (event) => {
    // Forward client message to server
    ws.send(JSON.stringify(event.data));
  });

  port.addEventListener('messageerror', () => connections.delete(port));
  port.start();
});

ws.addEventListener('message', (event) => {
  // Broadcast server message to all connected tabs via BroadcastChannel
  channel.postMessage(JSON.parse(event.data));
});
```

The `BroadcastChannel` API (Baseline Widely Available, same-origin only) delivers the message to all contexts subscribed to the named channel, including the tab that initiated the `SharedWorker` connection. This is more reliable than iterating `connections` and calling `port.postMessage()` on each, because `BroadcastChannel` handles dead ports silently.

### Reconnection and Heartbeat

The WebSocket connection inside the `SharedWorker` can be lost (server restart, network interruption). The `SharedWorker` implements exponential backoff reconnection independently: it listens for `ws.onclose`, waits the backoff delay, and reopens the connection. The tab-facing `BroadcastChannel` carries a `status` event type that communicates connection state (`connecting`, `connected`, `disconnected`) to all tabs so they can display appropriate UI.

A server-side heartbeat (periodic ping) keeps the connection alive through load balancers and proxies that close idle connections. The `SharedWorker` sends a lightweight keepalive message if no data has been sent for a configurable interval.

### Limitations

`SharedWorker` is not supported in all contexts. In particular, it is unavailable in Safari on iOS (as of mid-2026 — Safari on macOS supports it). Applications that must support iOS Safari must fall back to per-tab `WebSocket` connections, accepting the multiple-connection cost. The fallback is detected with `typeof SharedWorker !== 'undefined'`. When the fallback is active, the application should not open more than one WebSocket connection per tab, and tab coordination is achieved via `BroadcastChannel` across independently maintained connections.

---

## 14. Upload Handling and the XHR Gap

**Status:** `fetch()` does not support upload progress events as of mid-2026. `XMLHttpRequest.upload` progress events — Baseline Widely Available.

The source architecture document's `core.api.upload()` method handles file uploads with progress tracking. This is the one scenario in this architecture where `XMLHttpRequest` remains the correct platform API rather than `fetch()`.

### Why fetch() Does Not Suffice Here

`fetch()` can accept a `Blob`, `File`, `FormData`, `ArrayBuffer`, or `ReadableStream` as its `body`. However, as of mid-2026, `fetch()` does not expose upload progress events. The response body is a `ReadableStream` (enabling download progress tracking via chunk counting), but there is no equivalent for the upload direction.

Jake Archibald of the Chrome team documented this limitation in September 2025 and noted that an `observer` callback API was in development (by Luke Warlow of Igalia) to add progress events to `fetch()` for both upload and download. That proposal had not shipped in any browser as of mid-2026. Until it does, `XMLHttpRequest` remains the only standard way to track upload progress in all browsers.

### The XHR Upload Pattern

The `core.api.upload()` method wraps `XMLHttpRequest` in a `Promise` and calls a provided `onProgress` callback with `{ loaded, total }` as the upload proceeds:

```js
function upload(url, file, { onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({ loaded: event.loaded, total: event.total });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(normaliseXhrError(xhr));
      }
    });

    xhr.addEventListener('error', () => reject(new NetworkError('XHR upload failed')));
    xhr.addEventListener('abort', () => reject(new DOMException('Upload aborted', 'AbortError')));

    // AbortSignal integration
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    xhr.open('POST', url);
    // Auth header injected here from the outbound interceptor chain
    xhr.send(formData);
  });
}
```

`event.lengthComputable` must be checked before using `event.total`. If the server does not send a `Content-Length` response header, `event.total` is 0 and `event.loaded / event.total` would produce `NaN`. When `lengthComputable` is false, the UI should display an indeterminate progress indicator rather than a percentage.

### Streaming Uploads (Chromium Only)

`fetch()` with a `ReadableStream` as the `body` and `duplex: 'half'` in the request options enables streaming uploads on Chromium-based browsers. This allows the upload to begin before the entire payload is in memory — valuable for very large files where holding the entire file in `ArrayBuffer` would exceed available memory. Firefox and Safari do not support streaming fetch request bodies as of mid-2026. The `core.api.upload()` method uses `XMLHttpRequest` unconditionally for cross-browser consistency rather than attempting a streaming fetch with an XHR fallback.

---

## 15. SubtleCrypto Request Signing

**Spec:** W3C Web Cryptography API Level 2 **MDN:** `developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto` **Status:** Baseline Widely Available. Available only in Secure Contexts (HTTPS and `localhost`).

The `SubtleCrypto` interface (`window.crypto.subtle`) provides low-level cryptographic operations: key generation, import, signing, verification, encryption, decryption, and key derivation. All operations are asynchronous and return Promises.

### HMAC-SHA-256 Request Signing

When `options.sign` is `true`, the outbound interceptor computes an HMAC-SHA-256 signature over the canonical request representation. The signing key is a `CryptoKey` object held in memory, imported once at application initialisation from a server-provided key material via `crypto.subtle.importKey()`. The key is non-exportable (`extractable: false`) so it cannot be extracted from the running application by JavaScript code.

```js
// Key import (once at init, result cached)
const signingKey = await crypto.subtle.importKey(
  'raw',
  keyBuffer,        // Uint8Array from server-provisioned keying material
  { name: 'HMAC', hash: 'SHA-256' },
  false,            // non-extractable
  ['sign']
);

// Per-request signing
async function signRequest(method, url, bodyHash, timestamp) {
  const canonical = `${method}\n${url}\n${bodyHash}\n${timestamp}`;
  const data = new TextEncoder().encode(canonical);
  const signature = await crypto.subtle.sign('HMAC', signingKey, data);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
```

The canonical request string includes the HTTP method, the full URL, a hash of the request body (empty string hash for GET/HEAD), and an ISO 8601 timestamp. The server verifies the signature and rejects requests with timestamps outside an acceptable window (typically ±5 minutes) to prevent replay attacks.

### Secure Context Requirement

`SubtleCrypto` is only available in secure contexts: `https://` origins and `localhost`. Attempting to use it in an `http://` context (other than localhost) will throw a `NotSupportedError`. This architecture targets production deployments exclusively on HTTPS; the secure context requirement is not a practical constraint.

---

## 16. What the Networking Layer Does Not Own

**State management** — the networking layer fetches and delivers data. It does not decide where that data lives or how it is cached in application state. The store layer owns those decisions.

**Offline queue** — when a write fails due to connectivity loss, the networking layer reports the failure to the caller. The offline engine (described in `11. offline-engine.md`) owns the write queue and the retry-on-reconnect logic. The networking layer notifies the offline engine of connectivity events but does not manage the queue itself.

**Authentication token storage** — the networking layer reads the access token from the security module's in-memory store. It does not decide how tokens are obtained, refreshed, or persisted. Token lifecycle belongs to the auth subsystem.

**Response rendering** — the networking layer delivers parsed data to the caller. It has no knowledge of the DOM, component state, or rendering pipeline. The component or store that initiated the request owns what happens with the response.

**Service Worker fetch interception** — the Service Worker intercepts all outgoing fetch requests at the network proxy layer. The networking layer operates above this interception point. Cache strategies implemented in the networking layer and in the Service Worker are complementary: the Service Worker handles offline fallback for the application shell and static assets; the networking layer's Cache API integration handles API response caching within the application.

---

**References:**

- WHATWG Fetch Living Standard: `fetch.spec.whatwg.org`
- WHATWG Streams Living Standard: `streams.spec.whatwg.org`
- WHATWG HTML Living Standard — EventSource: `html.spec.whatwg.org/multipage/server-sent-events.html`
- WHATWG HTML Living Standard — WebSocket: `html.spec.whatwg.org/multipage/web-sockets.html`
- W3C Web Cryptography API Level 2: `w3c.github.io/webcrypto`
- MDN — Fetch API: `developer.mozilla.org/en-US/docs/Web/API/Fetch_API`
- MDN — ReadableStream: `developer.mozilla.org/en-US/docs/Web/API/ReadableStream`
- MDN — TransformStream: `developer.mozilla.org/en-US/docs/Web/API/TransformStream`
- MDN — Streams API Concepts (backpressure): `developer.mozilla.org/en-US/docs/Web/API/Streams_API/Concepts`
- MDN — AbortSignal: `developer.mozilla.org/en-US/docs/Web/API/AbortSignal`
- MDN — AbortSignal.any(): `developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static`
- MDN — AbortSignal.timeout(): `developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static`
- MDN — EventSource: `developer.mozilla.org/en-US/docs/Web/API/EventSource`
- MDN — XMLHttpRequestUpload: `developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequestUpload`
- MDN — SubtleCrypto.sign(): `developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign`
- MDN — Cache API: `developer.mozilla.org/en-US/docs/Web/API/Cache`
- MDN — SharedWorker: `developer.mozilla.org/en-US/docs/Web/API/SharedWorker`
- Jake Archibald — Fetch streams and upload progress (September 2025): `jakearchibald.com/2025/fetch-streams-not-for-progress/`
- WaspDev — Has fetch() caught up with XHR? (February 2026): `waspdev.com/articles/2025-10-10/has-fetch-caught-up-with-xhr`
- web.dev — stale-while-revalidate: `web.dev/articles/stale-while-revalidate`
- MDN Blog — Efficient data handling with the Streams API: `developer.mozilla.org/en-US/blog/efficient-data-handling-with-the-streams-api/`