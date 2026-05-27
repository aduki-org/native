## WebTransport, WebSockets Architecture, and Server-Sent Events — Deep Specification

**Spec:** W3C WebTransport; WHATWG HTML Living Standard (EventSource); RFC 6455 (WebSocket Protocol) **MDN:** `developer.mozilla.org/en-US/docs/Web/API/WebTransport_API` **MDN:** `developer.mozilla.org/en-US/docs/Web/API/WebSockets_API` **MDN:** `developer.mozilla.org/en-US/docs/Web/API/Server-sent_events` **Authority:** MDN Web Docs, W3C WebTransport WG, WHATWG Living Standard, IETF RFC 6455

---

## Overview and Protocol Landscape

The browser's native transport layer in 2026 comprises three distinct technologies, each occupying a different position in the reliability/complexity/use-case spectrum:

**Server-Sent Events (SSE)** — One-directional, server-to-client push over a plain persistent HTTP connection. The simplest possible real-time primitive. Built into `EventSource` with automatic reconnection and event-ID replay. Best for notification feeds, dashboards, live scores, and streaming AI token output — any case where bidirectionality is not required.

**WebSockets** — Full-duplex, bidirectional messaging over a single persistent TCP connection. Initiated via HTTP upgrade handshake (RFC 6455), then operates as a framing protocol above TCP. Universally supported and universally understood by infrastructure (proxies, load balancers, CDNs). The correct default for chat, collaborative editing, and live interactive state.

**WebTransport** — A multiplexed, bidirectional transport over HTTP/3 and QUIC. Supports independent reliable streams _and_ unreliable UDP-like datagrams over a single connection. Achieved Baseline in March 2026. The correct choice for low-latency, high-frequency, or mixed-reliability requirements: multiplayer games, sensor telemetry, video conferencing signalling, and real-time financial data.

Understanding when to reach for each is as important as knowing the API surface.

---

## 1. WebTransport

### Protocol Foundation: HTTP/3 and QUIC

WebTransport is layered atop HTTP/3, which is itself built on QUIC (RFC 9000). QUIC runs over UDP rather than TCP. This foundational difference drives every significant architectural property of WebTransport.

**TCP's head-of-line blocking problem:** In TCP-based transports (WebSocket included), the entire connection stalls when a single packet is lost — all subsequent data must wait for the retransmit. This is because TCP is a byte-stream protocol; the application layer cannot receive data out of order. HTTP/2 multiplexing improved throughput but did not fix this: multiple streams share one TCP connection, so a lost packet at the TCP layer still blocks every stream on the connection.

**QUIC's independent streams:** QUIC implements streams natively, and each stream is independently retransmitted. A dropped packet on stream A does not affect streams B or C. The stall is localised to the stream with the loss. For an application mixing a high-priority control channel with a bulk data transfer, this isolation is transformative.

**0-RTT reconnection:** QUIC's connection state includes a session ticket. On a repeat connection to the same server, QUIC can resume in 0 round-trips (0-RTT), sending application data in the very first packet. On a fresh connection to a known server, the TLS 1.3 handshake completes in 1-RTT. Compare with TCP + TLS 1.3 which requires a TCP handshake (1-RTT) followed by a TLS handshake (1-RTT) — minimum 2 RTTs before data flows.

**Connection migration:** QUIC uses a connection ID to identify connections rather than the 4-tuple (source IP, source port, destination IP, destination port) used by TCP. When a mobile device moves from Wi-Fi to cellular, its IP address changes. A TCP connection is torn down and must be re-established. A QUIC connection can migrate seamlessly because the connection ID remains constant regardless of the underlying network interface.

**Security:** All QUIC traffic is TLS 1.3-encrypted. This is not optional. WebTransport cannot be used without HTTPS and cannot disable encryption. All datagram traffic is encrypted and congestion-controlled — WebTransport datagrams are not raw UDP; they have the full security model of QUIC.

### Browser Support

WebTransport achieved **Baseline (Newly Available) in March 2026**, meaning it is supported across the latest versions of Chrome, Edge, Firefox, and Safari. Support spans desktop and mobile. The feature is available in Web Workers as well as the main thread. Requires a secure context (HTTPS / `localhost`).

Older Safari versions and iOS Safari before the Baseline date do not support WebTransport. A fallback strategy to WebSocket (or even SSE) is essential for applications targeting the long tail of browser versions.

One critical deployment caveat: many corporate and hotel networks block UDP traffic on port 443. WebTransport's handshake will fail fast in these environments. Applications must detect the failure (which surfaces as a rejected `transport.ready` promise or a `WebTransportError`) and fall back to WebSocket.

### Connection Lifecycle

A WebTransport connection is established by constructing a `WebTransport` instance and awaiting the `ready` promise:

```js
const transport = new WebTransport('https://example.com:4999/wt');
await transport.ready;
// Connection established — datagrams and streams are now available
```

The `WebTransport()` constructor accepts an options object with the following notable keys:

- **`allowPooling`** (`boolean`, default `false`) — Whether the network connection for this session can be shared with a pool of other HTTP/3 sessions. Set `true` to reduce connection overhead when opening multiple `WebTransport` sessions to the same server.
- **`congestionControl`** (`string`: `"default"` | `"throughput"` | `"low-latency"`) — Application hint to the QUIC congestion controller. `"low-latency"` will prefer smaller QUIC packets and faster transmission at the possible cost of throughput. `"throughput"` favours maximising data volume.
- **`requireUnreliable`** (`boolean`, default `false`) — If `true`, the connection will fail rather than fall back to HTTP/2 in environments where QUIC is unavailable.
- **`serverCertificateHashes`** (`Array<{algorithm, value}>`) — Bypasses normal PKI validation and pins the connection to a specific server certificate hash. The certificate must be an X.509v3 certificate with a validity period of less than two weeks. Enables connecting to local development servers, VM-hosted servers, and edge devices that do not have a long-lived TLS certificate.

The connection exposes:

- **`transport.ready`** — `Promise<undefined>`. Fulfils when the connection is ready. Rejects if the connection fails.
- **`transport.closed`** — `Promise<{closeCode, reason}>`. Fulfils when the connection is cleanly closed. Rejects on abrupt closure.
- **`transport.datagrams`** — A `WebTransportDatagramDuplexStream` for sending and receiving unreliable datagrams.
- **`transport.incomingBidirectionalStreams`** — `ReadableStream<WebTransportBidirectionalStream>`. Server-initiated bidirectional streams arrive here.
- **`transport.incomingUnidirectionalStreams`** — `ReadableStream<WebTransportReceiveStream>`. Server-initiated unidirectional streams arrive here.
- **`transport.reliability`** — `string` (`"pending"` | `"reliable-only"` | `"supports-unreliable"`). Reflects whether the connection is over QUIC and therefore supports datagrams.
- **`transport.congestionControl`** — `string`. The negotiated congestion control preference.

Closing is explicit:

```js
transport.close({ closeCode: 0, reason: 'user navigated away' });
```

### Communication Primitives

#### Datagrams — Unreliable, Unordered

`transport.datagrams` is a `WebTransportDatagramDuplexStream` with two sides:

- `transport.datagrams.writable` — `WritableStream<Uint8Array>`. Write datagrams to this stream for transmission to the server.
- `transport.datagrams.readable` — `ReadableStream<Uint8Array>`. Read incoming datagrams from this stream.

Datagrams are subject to path MTU (Maximum Transmission Unit) limits. `transport.datagrams.maxDatagramSize` (read-only) indicates the maximum payload size in bytes. Exceeding it causes a silent drop. Typical values are around 1200 bytes on standard internet paths.

The browser's QUIC implementation applies congestion control to datagram sends. Application data written to the writable stream enters a send buffer. If the QUIC congestion window is exhausted, the browser may drop buffered datagrams rather than queue them indefinitely — this is the correct behaviour for latency-sensitive applications. The `incomingHighWaterMark` and `outgoingHighWaterMark` properties on the duplex stream control the read/write buffer sizes.

Use datagrams for: game input (player position updates), cursor position sync in collaborative tools, sensor telemetry where each reading supersedes the previous, video frame metadata. The key invariant is that the application is _tolerant of loss_ — a missed reading is acceptable because a more recent one will arrive shortly.

#### Bidirectional Streams — Reliable, Ordered Within a Stream

Client-initiated bidirectional streams:

```js
const stream = await transport.createBidirectionalStream();
// stream.writable  — write to server
// stream.readable  — read from server
```

Server-initiated bidirectional streams arrive on `transport.incomingBidirectionalStreams`. This is a `ReadableStream` of `WebTransportBidirectionalStream` objects. To accept server streams, you must actively read from it — server streams are not delivered by events.

Each bidirectional stream is fully independent. Ordering guarantees apply only _within a single stream_, not across streams. A `transport.createBidirectionalStream()` call returns a promise — the stream is not created until the QUIC stream ID is allocated and the connection has capacity.

#### Unidirectional Streams — One-Way Reliable

`transport.createUnidirectionalStream()` returns a `Promise<WritableStream<Uint8Array>>` — a stream for sending data to the server only (no response on this stream). Server-to-client unidirectional streams arrive on `transport.incomingUnidirectionalStreams`.

Unidirectional streams are useful for fire-and-forget bulk sends where the response will arrive on a separate channel, and for fan-out server push of messages to many listeners.

#### Choosing the Right Primitive

|Requirement|Primitive|
|---|---|
|Real-time, loss-tolerant, sub-packet-latency|Datagram|
|Ordered, reliable request/response|Bidirectional stream|
|Bulk upload, reliable, no response needed|Unidirectional stream (client→server)|
|Server push, reliable, ordered|Unidirectional stream (server→client)|
|Mixed: control channel + telemetry|Bidirectional stream + datagrams|

### Error Handling

Errors from WebTransport operations are `WebTransportError` instances, which extend `DOMException`. They carry additional context: a `source` property (`"stream"` or `"session"`) and an `streamErrorCode` (a QUIC application error code).

The connection itself may close unexpectedly (network loss, server shutdown, QUIC error). Awaiting `transport.closed` and handling rejections is essential. Individual streams close when their `readable` side is exhausted or their `writable` side is closed or aborted.

### Backpressure

All WebTransport streams integrate with the WHATWG Streams API and its backpressure model. The `WritableStream` reports backpressure through `desiredSize` and the `writer.ready` promise. An application that writes faster than the QUIC transport can send will naturally be throttled by the backpressure signal, rather than accumulating unbounded buffers in memory.

### WebTransport in Workers

WebTransport is available in both Dedicated Workers and Shared Workers. This is important for architecture: the transport connection can live in a Worker, off the main thread, processing incoming data (parsing, transforming, dispatching) without contributing to main-thread contention. Parsed results can be sent back to the main thread via `postMessage`.

### Fallback Strategy

Because QUIC is blocked on some networks and WebTransport is not yet universally available in older browsers:

```
1. Feature-detect: 'WebTransport' in globalThis
2. Attempt connection, await transport.ready with a timeout
3. On rejection or timeout, fall back to WebSocket
4. Log the fallback case for monitoring — UDP blockage is a signal about the environment
```

---

## 2. WebSockets

### Protocol Architecture

The WebSocket protocol (RFC 6455) upgrades an HTTP/1.1 connection to a persistent, full-duplex, message-framed TCP connection. The upgrade handshake is a standard HTTP request with specific headers:

The client sends:

```
GET /chat HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Sec-WebSocket-Protocol: chat.v2
```

The server responds with HTTP 101 Switching Protocols. After the handshake, the connection is a raw TCP pipe with the WebSocket framing protocol — text or binary frames, ping/pong control frames, and a close handshake.

The `Sec-WebSocket-Protocol` header negotiates a **subprotocol** — an application-level contract for how messages are structured on the channel. The server responds with the single subprotocol it has selected. Subprotocol names may be any string mutually understood by client and server; by convention, domain-qualified names avoid collisions: `chat.example.com`. Registered subprotocols (SOAP, WAMP, etc.) are in the IANA WebSocket Subprotocol Name Registry.

The `Sec-WebSocket-Extensions` header negotiates **extensions** — modifications to the WebSocket framing layer itself. The most important deployed extension is `permessage-deflate`, which compresses message payloads at the framing level, transparently to the application. Extensions are negotiated, not mandated.

### The `WebSocket` Interface

**Spec:** WHATWG HTML Living Standard  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/WebSocket`  
**Status:** Universally available (Baseline).

```js
const socket = new WebSocket('wss://example.com/chat', ['chat.v2']);
```

The constructor takes the WebSocket URL (`ws://` or `wss://`; `http://` and `https://` are also accepted and mapped) and an optional array of subprotocols in preference order. The connection attempt begins immediately on construction.

Key properties:

- **`socket.readyState`** — `0` (CONNECTING), `1` (OPEN), `2` (CLOSING), `3` (CLOSED). Do not send before `readyState === 1`.
- **`socket.bufferedAmount`** — The number of bytes queued in the send buffer but not yet transmitted to the network. Useful for flow control: if `bufferedAmount` exceeds a threshold, back off sending until it drains.
- **`socket.protocol`** — The subprotocol selected by the server (empty string if none was negotiated).
- **`socket.extensions`** — The extensions selected by the server.
- **`socket.binaryType`** — `"blob"` (default) or `"arraybuffer"`. Controls how binary frames are delivered to the `message` event handler. For performance-sensitive binary protocols, `arraybuffer` is strongly preferred — it avoids the Blob-to-ArrayBuffer conversion overhead.

Key methods:

- **`socket.send(data)`** — Queues data for transmission. `data` may be a `string`, `ArrayBuffer`, `ArrayBufferView`, or `Blob`. Calling `send()` on a non-OPEN socket is a `DOMException`.
- **`socket.close(code?, reason?)`** — Initiates the WebSocket close handshake. `code` is an application-defined close code (1000–4999; 1000 means normal closure). `reason` is a short human-readable UTF-8 string.

Key events (attach via `addEventListener` or `on*` handler):

- **`open`** — Fired when the connection is established.
- **`message`** — Fired when a message frame is received. `event.data` holds the payload: a `string` for text frames, an `ArrayBuffer` or `Blob` for binary frames (depending on `binaryType`).
- **`error`** — Fired on connection error. The event carries no error detail (for security reasons).
- **`close`** — Fired when the connection is closed. `event.wasClean` (`boolean`), `event.code` (close code), and `event.reason` (close reason string) are available.

### The `WebSocketStream` Interface

**MDN:** `developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Using_WebSocketStream`  
**Status:** Non-standard; Chromium-only at time of writing. Do not use in production without a feature-detect and fallback.

The original `WebSocket` API is event-driven and does not integrate with the WHATWG Streams backpressure model. When a server sends messages faster than the application can process them, the event queue accumulates without bound — the application will either fill memory or pin the CPU. There is no native mechanism to signal the server to slow down.

`WebSocketStream` solves this by wrapping the WebSocket connection in a Streams-API interface. The connection exposes `readable` and `writable` streams. Because these are standard `ReadableStream` and `WritableStream`, the backpressure signals from the Streams API propagate automatically: if the application's reader is slow, the `ReadableStream`'s internal queue fills, which eventually pauses the underlying network reads.

Until `WebSocketStream` achieves cross-browser support, the practical mitigation for the original API's backpressure problem is to manage the `bufferedAmount` property manually for sends, and to implement application-level acknowledgement or sampling for receives.

### Reconnection

The native `WebSocket` API does not reconnect automatically. The `close` event fires, and the application must decide whether to reconnect. A production reconnection strategy uses exponential backoff with jitter to avoid reconnection storms:

- Attempt 1: wait 500ms
- Attempt 2: wait 1000ms
- Attempt 3: wait 2000ms
- Attempt N: wait `min(500 * 2^N, 30000)ms` + random jitter

The `AbortSignal` pattern can be used to cancel a pending reconnection if the user navigates away:

```js
async function connect(url, signal) {
  while (!signal.aborted) {
    const ws = new WebSocket(url);
    await new Promise((resolve) => ws.addEventListener('close', resolve, { once: true }));
    if (!signal.aborted) await delay(backoff());
  }
}
```

### Binary Subprotocols

For high-throughput or structured data, a binary subprotocol eliminates the overhead of JSON serialization and text frame encoding. Common approaches: MessagePack (compact binary JSON), Protocol Buffers (schema-defined), CBOR (Concise Binary Object Representation). Set `socket.binaryType = 'arraybuffer'` and use `DataView` or a typed array to read/write structured binary data.

### WebSocket vs WebTransport — Decision Guide

**Choose WebSocket when:**

- Universal browser and infrastructure support is required (proxies, CDNs, corporate firewalls)
- The protocol is a simple message queue (chat, notifications, collaborative editing state)
- Your server infrastructure supports WebSocket but not HTTP/3/QUIC
- The transport layer must work over HTTP/2 (fallback from WebSocket on some proxies)

**Choose WebTransport when:**

- Multiple independent streams of data must flow over one connection (game state + voice signalling + chat)
- Some data is loss-tolerant but latency-critical (cursor positions, game input)
- Connection migration across networks is valuable (mobile users switching between Wi-Fi and cellular)
- Head-of-line blocking has been measured as a bottleneck in the application

---

## 3. Server-Sent Events (EventSource)

### Conceptual Model

Server-Sent Events is the simplest real-time transport available on the web. A client makes a normal HTTP GET request. The server responds with `Content-Type: text/event-stream` and keeps the response body open, writing event records continuously. The browser processes these records and dispatches them to the `EventSource` object's event listeners. No new protocol, no upgrade handshake — just a long-lived HTTP response.

This simplicity makes SSE uniquely compatible with existing infrastructure. It works over HTTP/1.1 and HTTP/2. It traverses proxies and CDNs that would reject WebSocket upgrade requests. It benefits from HTTP/2 multiplexing — multiple SSE streams from the same origin share a single TCP connection without consuming separate connections. Under HTTP/1.1, each `EventSource` connection occupies one of the browser's per-origin connection slots (typically 6), which becomes a constraint when opening many concurrent streams.

**One-directional:** SSE is server-to-client only. The client sends data to the server via normal HTTP requests — `fetch`, `XMLHttpRequest` — not through the `EventSource` connection. This is not a limitation but a deliberate design: many use cases (notifications, live data feeds, progress streams) only require server push, and SSE's simplicity makes it demonstrably more reliable and infrastructure-compatible than WebSocket for these patterns.

### The `EventSource` Interface

**Spec:** WHATWG HTML Living Standard, §9.2  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/EventSource`  
**Status:** Baseline. Universally supported.

```js
const source = new EventSource('/api/stream');
// For cross-origin:
const source = new EventSource('https://other.example.com/events', { withCredentials: true });
```

The constructor takes the URL and an optional `EventSourceInit` dictionary with one key: `withCredentials` (`boolean`, default `false`). When `true`, CORS credentials (cookies, client certificates) are included on the request. The server must respond with `Access-Control-Allow-Credentials: true` and a specific (non-wildcard) `Access-Control-Allow-Origin`.

Properties:

- **`source.readyState`** — `0` (CONNECTING), `1` (OPEN), `2` (CLOSED).
- **`source.url`** — The URL of the event stream.
- **`source.withCredentials`** — Whether credentials mode is active.

Events:

- **`open`** — The connection was established.
- **`message`** — A message event was received (i.e., an event record with no `event:` field, or with `event: message`). `event.data` is the concatenated `data:` field value. `event.lastEventId` is the ID from the most recent `id:` field.
- **`error`** — The connection was lost. The `EventSource` will automatically attempt to reconnect (see below).
- **Named events** — `addEventListener('update', handler)` listens only for event records with `event: update`. This is the mechanism for typed event dispatch over a single SSE channel.

Closing:

```js
source.close();  // readyState transitions to CLOSED; no automatic reconnection occurs
```

### The `text/event-stream` Wire Format

The server sends UTF-8 text. Lines are separated by a single LF, CR, or CRLF. Event records are separated by a blank line (double newline). Each line within a record has the form `field: value`.

Defined fields:

- **`data`** — The payload. Multiple `data:` lines in a single record are concatenated with a newline separator into `event.data`. An empty `data:` line contributes a newline. The record is dispatched as an event when the blank line is reached.
- **`event`** — The event type. If present, the event fires with this type (e.g., `source.addEventListener('update', ...)` rather than `source.onmessage`). If absent, the event fires as a `message` event.
- **`id`** — The event ID. Stored as the EventSource's _last event ID_. Sent as the `Last-Event-ID` HTTP header on reconnection. Allows the server to resume the stream from a known position. Setting `id:` to an empty string resets the last event ID (no `Last-Event-ID` header will be sent on reconnection).
- **`retry`** — An integer (milliseconds). Sets the reconnection delay for subsequent connection losses. This is how the server communicates to the client how long to wait before retrying.

Lines beginning with `:` are comments. Comments are ignored by the browser. Servers use them as keep-alive pings to prevent proxy timeouts:

```
: keep-alive

data: {"price": 105.32}
id: 42
event: price-update

data: first line
data: second line
event: notice
id: 43

```

### Automatic Reconnection

When the connection drops — network loss, server restart, or any HTTP error — the `EventSource` enters CONNECTING state and schedules a reconnection attempt after a delay. The default reconnection interval is defined in the HTML specification as approximately 3000 milliseconds, though implementations may vary. Servers can override it with a `retry:` field.

On reconnection, the browser includes the `Last-Event-ID` header if a non-empty event ID was last received. The server reads this header and resumes the event stream from the appropriate position. This mechanism provides _at-least-once delivery_ for events that carry IDs, resilient to transient network failures.

The `EventSource` will not reconnect if:

- The server responds with HTTP 204 (No Content).
- The application calls `source.close()`.
- The server responds with an HTTP error code other than a network-level failure (behaviour varies by browser; a 404 or 403 will typically stop reconnection).

### SSE vs WebSocket — Decision Guide

**Choose SSE when:**

- The communication is one-directional: server → client
- You need auto-reconnect built into the platform without custom code
- Infrastructure compatibility matters (SSE works through more proxies than WebSocket)
- The use case is: notifications, live scores, news feeds, AI response streaming, server-side log tailing, long-running job progress

**Choose WebSocket when:**

- Both client and server send messages
- The use case is: chat, collaborative real-time editing, live interactive games, bidirectional state synchronisation

**SSE and AI token streaming:** SSE has emerged as the dominant transport for large language model streaming responses, including the OpenAI and Anthropic streaming APIs. Each generated token (or small batch of tokens) is sent as a `data:` field. The client renders tokens incrementally as `message` events arrive, giving the familiar "typewriter" effect of streaming completions.

---

## Transport Layer Architecture in a Native Web Application

The three transports compose as independent layers, not mutually exclusive choices. A production native web application might use all three simultaneously:

- **SSE** for push notifications and presence events (read-heavy, one-directional, benefits from infrastructure compatibility)
- **WebSocket** for the primary collaborative/chat channel (bidirectional, ordered, widely supported)
- **WebTransport** for the high-frequency game state or sensor feed (multiplexed, low-latency, datagram + stream mix)

All three integrate naturally with the Service Worker layer:

- SSE responses can be cached by a Service Worker (as partial stream caches are impractical, typically SSE bypasses the cache and the Service Worker acts as a relay — dispatching events to clients via `client.postMessage`)
- WebSocket connections can be managed and multiplexed through a Shared Worker so that multiple tabs share one connection
- WebTransport connections, available in Workers, can similarly be moved off the main thread

---

## References

- W3C WebTransport Spec: `w3c.github.io/webtransport/`
- W3C WebTransport Explainer: `github.com/w3c/webtransport/blob/main/explainer.md`
- MDN — WebTransport API: `developer.mozilla.org/en-US/docs/Web/API/WebTransport_API`
- MDN — WebTransport Interface: `developer.mozilla.org/en-US/docs/Web/API/WebTransport`
- MDN — WebTransport Constructor Options: `developer.mozilla.org/en-US/docs/Web/API/WebTransport/WebTransport`
- MDN — WebSockets API: `developer.mozilla.org/en-US/docs/Web/API/WebSockets_API`
- MDN — WebSocket Interface: `developer.mozilla.org/en-US/docs/Web/API/WebSocket`
- MDN — Writing WebSocket Servers: `developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers`
- MDN — WebSocketStream: `developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Using_WebSocketStream`
- WHATWG — Server-Sent Events Spec: `html.spec.whatwg.org/multipage/server-sent-events.html`
- MDN — EventSource: `developer.mozilla.org/en-US/docs/Web/API/EventSource`
- MDN — Using Server-Sent Events: `developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events`
- RFC 6455 — WebSocket Protocol: `rfc-editor.org/rfc/rfc6455`
- RFC 9000 — QUIC Transport Protocol: `rfc-editor.org/rfc/rfc9000`